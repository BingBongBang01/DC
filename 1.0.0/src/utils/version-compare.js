/**
 * "1.2.10"과 "1.9.0" 같은 semver 문자열을 숫자 기준으로 비교
 * @returns {number} a<b: -1, a===b: 0, a>b: 1
 */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}
