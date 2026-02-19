/**
 * Maps raw auth/API error messages to safe, user-friendly messages in Portuguese.
 * Prevents leaking internal details like database constraints or auth configuration.
 */
export function mapAuthError(error: string): string {
  const msg = error.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos';
  if (msg.includes('user already registered') || msg.includes('already been registered')) return 'Este e-mail já está cadastrado';
  if (msg.includes('email not confirmed')) return 'Confirme seu e-mail antes de fazer login';
  if (msg.includes('password') && msg.includes('short')) return 'A senha é muito curta';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Muitas tentativas. Aguarde antes de tentar novamente.';
  if (msg.includes('email') && msg.includes('invalid')) return 'Formato de e-mail inválido';
  return 'Ocorreu um erro. Tente novamente mais tarde.';
}

/**
 * Validates a name input (sector, sede, user full name).
 * Returns an error message string or null if valid.
 */
export function validateName(name: string, maxLength = 100): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Nome não pode estar vazio';
  if (trimmed.length > maxLength) return `Nome muito longo (máx. ${maxLength} caracteres)`;
  return null;
}
