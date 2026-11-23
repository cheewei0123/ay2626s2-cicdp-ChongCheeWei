// Settings for the SplitLah Telegram bot, which checks PayNow numbers for free (KAN-91).
// All three come from @BotFather and the server's .env; with none set, the bot is off.
export interface TelegramConfig {
  token: string; // from @BotFather, e.g. 123456:ABC-DEF…
  username: string; // the bot's @name without the @, for the t.me link
  secret: string; // Telegram sends it back on every webhook call, so fakes are refused
}

type TelegramEnv = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};

export const TELEGRAM_CONFIG = Symbol('TELEGRAM_CONFIG');

// null when the bot is off. A half-set or badly typed setting stops the app at
// startup, like the other providers, instead of failing at someone's first check.
export function createTelegramConfig(env: TelegramEnv): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const username = env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? '';
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
  if (!token && !username && !secret) return null;

  if (!token || !username || !secret)
    throw new Error(
      'Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET together',
    );
  if (!/^\d+:[\w-]+$/.test(token))
    throw new Error('TELEGRAM_BOT_TOKEN should look like 123456:ABC-DEF…');
  // Telegram's rules: bot names end in "bot"; the secret is 1-256 of A-Z a-z 0-9 _ -
  if (!/^\w{5,32}$/.test(username) || !/bot$/i.test(username))
    throw new Error(
      'TELEGRAM_BOT_USERNAME should be the bot name, e.g. SplitLahBot',
    );
  if (!/^[\w-]{16,256}$/.test(secret))
    throw new Error(
      'TELEGRAM_WEBHOOK_SECRET should be 16 to 256 letters, digits, _ or -',
    );
  return { token, username, secret };
}

// Tells Telegram where to send the bot's messages. Run at every start, so a new
// server address or secret takes effect by itself; it never stops the app.
export async function registerWebhook(
  config: TelegramConfig,
  appUrl: string,
  post: typeof fetch = fetch,
): Promise<string> {
  const url = `${appUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  // Telegram only calls https addresses, so a local run never contacts it
  if (!url.startsWith('https://'))
    return 'webhook not set: Telegram needs an https APP_URL';
  try {
    const response = await post(
      `https://api.telegram.org/bot${config.token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          secret_token: config.secret,
          allowed_updates: ['message'], // nothing else is used
        }),
      },
    );
    const body = (await response.json()) as {
      ok: boolean;
      description?: string;
    };
    return body.ok
      ? `webhook set to ${url}`
      : `webhook not set: ${body.description ?? response.status}`;
  } catch (error) {
    return `webhook not set: ${(error as Error).message}`;
  }
}
