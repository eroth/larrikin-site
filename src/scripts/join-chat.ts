// A messaging-style join form: one question at a time, answered in chat bubbles.
// With no endpoint configured (local preview) it simulates sending and posts nothing.
const root = document.getElementById('join-chat');

if (root) {
  const log = root.querySelector<HTMLElement>('.chat-log')!;
  const choicesEl = root.querySelector<HTMLElement>('.chat-choices')!;
  const form = root.querySelector<HTMLFormElement>('.chat-input')!;
  const input = form.elements.namedItem('reply') as HTMLInputElement;
  const honeypot = form.elements.namedItem('website') as HTMLInputElement;
  const send = form.querySelector<HTMLButtonElement>('button')!;

  const endpoint = root.dataset.endpoint ?? '';
  const contact = root.dataset.contact ?? '';
  const hubs: string[] = JSON.parse(root.dataset.hubs ?? '[]');
  const siteKey = root.dataset.turnstileSiteKey ?? '';
  const turnstileBox = root.querySelector<HTMLElement>('.chat-turnstile')!;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const answers: Record<string, string> = {};

  type Step = {
    key: 'name' | 'email' | 'hub' | 'coffee';
    ask: () => string;
    label: string;
    type?: 'text' | 'email';
    autocomplete?: string;
    max?: number;
    optional?: boolean;
    choices?: string[];
  };

  const steps: Step[] = [
    { key: 'name', ask: () => 'Hi! Want to join the collective? What should we call you?', label: 'Your name', type: 'text', autocomplete: 'name', max: 80 },
    { key: 'email', ask: () => `Nice to meet you, ${answers.name}. What's the best email to reach you on?`, label: 'Your email', type: 'email', autocomplete: 'email', max: 120 },
    { key: 'hub', ask: () => 'Which hub is closest to you?', label: 'Hub', choices: [...hubs, 'Somewhere else'] },
    { key: 'coffee', ask: () => "Last one: what's your favourite way to drink coffee? Totally optional.", label: 'e.g. flat white, filter, espresso', type: 'text', max: 200, optional: true },
  ];

  const pause = (ms: number) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));

  function bubble(who: 'bot' | 'user', text: string) {
    const el = document.createElement('div');
    el.className = `bubble ${who}`;
    el.textContent = text;
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  async function botSays(text: string) {
    const typing = bubble('bot', '');
    typing.classList.add('typing');
    typing.setAttribute('aria-hidden', 'true');
    typing.innerHTML = '<i></i><i></i><i></i>';
    await pause(500);
    typing.remove();
    bubble('bot', text);
  }

  function setInputMode(step: Step | null, focus = true) {
    const show = !!step && !step.choices;
    form.hidden = !show;
    choicesEl.hidden = !(step?.choices);
    choicesEl.replaceChildren();
    if (step?.choices) {
      step.choices.forEach((choice) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = choice;
        b.addEventListener('click', () => answer(step, choice));
        choicesEl.append(b);
      });
      if (focus) (choicesEl.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
    }
    if (show && step) {
      input.type = step.type ?? 'text';
      input.maxLength = step.max ?? 200;
      input.setAttribute('aria-label', step.label);
      input.placeholder = step.label;
      input.autocomplete = step.autocomplete ?? 'off';
      input.value = '';
      send.textContent = step.optional ? 'Send / skip' : 'Send';
      if (focus) input.focus({ preventScroll: true });
    }
  }

  // Cloudflare Turnstile bot check. Only loaded when the form is live and the visitor reaches it.
  let token = '';
  let widgetId: string | undefined;
  const turnstile = () => (window as any).turnstile;

  function startTurnstile() {
    if (!endpoint || !siteKey) return;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      widgetId = turnstile().render(turnstileBox, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        callback: (t: string) => (token = t),
        'expired-callback': () => (token = ''),
        'error-callback': () => (token = ''),
      });
    };
    document.head.append(script);
  }

  async function waitForToken(ms = 20000) {
    for (let waited = 0; !token && waited < ms; waited += 250) await new Promise((r) => setTimeout(r, 250));
    return token;
  }

  let current = 0;

  async function ask(i: number) {
    setInputMode(null);
    await botSays(steps[i].ask());
    // Don't grab focus for the first question: it would pop the keyboard open on phones just from scrolling past.
    setInputMode(steps[i], i > 0);
  }

  async function answer(step: Step, raw: string) {
    const value = raw.trim();
    if (!value && !step.optional) return;
    if (step.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      bubble('user', value);
      await botSays("That doesn't look like an email address. Could you check it?");
      input.focus();
      return;
    }
    answers[step.key] = value;
    bubble('user', value || 'Skip');
    current += 1;
    if (current < steps.length) await ask(current);
    else await finish();
  }

  async function finish() {
    setInputMode(null);
    await botSays(`Thanks ${answers.name}, sending that over now.`);
    try {
      if (endpoint) {
        const turnstileToken = await waitForToken();
        if (!turnstileToken) throw new Error('verification');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...answers, website: honeypot.value, turnstileToken }),
        });
        // A Turnstile token works once, so ask for a fresh one whatever happened.
        token = '';
        if (widgetId !== undefined) turnstile().reset(widgetId);
        if (!res.ok) throw new Error(String(res.status));
      } else {
        await pause(600);
      }
      await botSays(
        `All done. Someone from our team will email ${answers.email} with next steps and an invite to our Discord.` +
          (endpoint ? '' : ' (Preview only: nothing was actually sent.)'),
      );
    } catch {
      await botSays(`Sorry, that didn't go through.${contact ? ` Could you email ${contact} instead?` : ' Please try again later.'}`);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void answer(steps[current], input.value);
  });

  // Start the conversation only once the chat is about to be seen.
  new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    startTurnstile();
    void ask(0);
  }, { rootMargin: '100px' }).observe(root);
}
