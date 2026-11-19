// Same rule as the server (functions/src/account/adult.js): whole years from a YYYY-MM-DD date of birth.
// The browser only uses this for a friendly early answer; the server decides.
export function ageOn(dob, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (date > now || y < 1900) return null;
  let age = now.getUTCFullYear() - y;
  if (!(now.getUTCMonth() > mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() >= d))) age -= 1;
  return age;
}
