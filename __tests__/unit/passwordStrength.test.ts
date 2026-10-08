import { passwordStrength } from '@/features/auth/passwordStrength';

describe('passwordStrength', () => {
  it('rejects anything under 8 characters', () => {
    const s = passwordStrength('Ab1!x');
    expect(s.score).toBe(0);
    expect(s.acceptable).toBe(false);
    expect(s.checks.find((c) => c.id === 'length')?.met).toBe(false);
  });

  it('treats common passwords as weak, including leetspeak', () => {
    expect(passwordStrength('password123').acceptable).toBe(false);
    expect(passwordStrength('P@ssw0rd').acceptable).toBe(false);
    expect(passwordStrength('iloveyou1').label).toBe('Weak');
  });

  it('penalizes runs and personal info', () => {
    expect(passwordStrength('Abcd1234!').score).toBeLessThan(passwordStrength('Zq8!mv2Rt').score);
    const personal = passwordStrength('Jessica!2024x', ['jessica.smith@gmail.com'.split('@')[0], 'Jessica']);
    expect(personal.hint).toMatch(/name or email/);
  });

  it('rewards length and variety', () => {
    expect(passwordStrength('tacotuesday').label).toBe('Weak');
    expect(passwordStrength('tacotuesday9!').acceptable).toBe(true);
    expect(passwordStrength('Purple-Tacos-at-9pm!').label).toBe('Strong');
    expect(passwordStrength('Purple-Tacos-at-9pm!').hint).toBeNull();
  });

  it('reports which checks are met', () => {
    const s = passwordStrength('lowercase1');
    expect(s.checks.map((c) => c.met)).toEqual([true, false, true, false]);
  });
});
