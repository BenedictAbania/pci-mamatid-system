/** Identity display only. Metadata never grants a role or any permission. */
export function accountDisplayName(fullName: unknown, email?: string) {
  return (typeof fullName === 'string' && fullName.trim()) || email?.split('@')[0] || 'LAKAD User';
}
