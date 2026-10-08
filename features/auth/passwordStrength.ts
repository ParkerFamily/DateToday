export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthLevel;
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  checks: { id: 'length' | 'case' | 'number' | 'symbol'; label: string; met: boolean }[];
  /** Short tip for the most useful next improvement, or null when strong. */
  hint: string | null;
  acceptable: boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789', '1234567890', '11111111',
  '00000000', 'qwertyui', 'qwerty123', 'qwertyuiop', 'iloveyou', 'iloveyou1', 'letmein1', 'welcome1',
  'abc12345', 'abcd1234', 'baseball', 'football', 'sunshine', 'princess', 'starwars', 'whatever',
  'trustno1', 'dragon12', 'monkey123', 'superman', 'michael1', 'charlie1', 'datetoday', 'datetoday1',
  'tinder123', 'bumble123', 'hinge123', 'loveyou1', 'babygirl', 'lovelove', 'asdfghjk', 'zxcvbnm1',
]);

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '01234567890'];

function hasRun(pw: string): boolean {
  const lower = pw.toLowerCase();
  if (/(.)\1{3,}/.test(lower)) return true;
  return SEQUENCES.some((seq) => {
    for (let i = 0; i + 4 <= seq.length; i += 1) {
      const chunk = seq.slice(i, i + 4);
      if (lower.includes(chunk) || lower.includes([...chunk].reverse().join(''))) return true;
    }
    return false;
  });
}

const LABELS: PasswordStrength['label'][] = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

/** Rough, offline strength estimate. `personal` = email/name bits the password shouldn't contain. */
export function passwordStrength(password: string, personal: string[] = []): PasswordStrength {
  const pw = password ?? '';
  const lower = /[a-z]/.test(pw);
  const upper = /[A-Z]/.test(pw);
  const number = /\d/.test(pw);
  const symbol = /[^A-Za-z0-9]/.test(pw);
  const checks: PasswordStrength['checks'] = [
    { id: 'length', label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: pw.length >= MIN_PASSWORD_LENGTH },
    { id: 'case', label: 'Upper and lowercase letters', met: lower && upper },
    { id: 'number', label: 'A number', met: number },
    { id: 'symbol', label: 'A symbol (like ! or #)', met: symbol },
  ];

  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { score: 0, label: LABELS[0], checks, hint: `Use at least ${MIN_PASSWORD_LENGTH} characters.`, acceptable: false };
  }

  const variety = [lower, upper, number, symbol].filter(Boolean).length;
  let score = (pw.length >= 16 ? 3 : pw.length >= 12 ? 2 : 1) + (variety >= 3 ? 1 : 0) + (variety === 4 ? 1 : 0);

  const normalized = pw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const leet = pw
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[$5]/g, 's')
    .replace(/0/g, 'o')
    .replace(/[1!]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[^a-z0-9]/g, '');
  const common = COMMON.has(pw.toLowerCase()) || COMMON.has(normalized) || COMMON.has(leet);
  const personalHit = personal
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .some((p) => p.length >= 3 && normalized.includes(p));
  const run = hasRun(pw);

  if (common) score = 1;
  if (personalHit) score -= 1;
  if (run) score -= 1;
  const clamped = Math.max(1, Math.min(4, score)) as StrengthLevel;

  let hint: string | null = null;
  if (common) hint = 'That’s a very common password. Pick something only you would use.';
  else if (personalHit) hint = 'Avoid using your name or email in your password.';
  else if (run) hint = 'Avoid repeated or sequential characters like 1234 or aaaa.';
  else if (clamped < 4 && pw.length < 12) hint = 'Longer is stronger — try 12+ characters or a short phrase.';
  else if (clamped < 4) hint = 'Mix in a number, symbol or capital letter.';

  return { score: clamped, label: LABELS[clamped], checks, hint, acceptable: clamped >= 2 };
}
