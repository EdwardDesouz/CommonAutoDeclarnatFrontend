export const ACCOUNT_FIELD_CONFIG = {
  NNR: { showDeclaringFor: false },
  LINEHAUL: { showDeclaringFor: false },
  DEFAULT: { showDeclaringFor: true },
};

export function getFieldConfig(accountId) {
  return ACCOUNT_FIELD_CONFIG[accountId] || ACCOUNT_FIELD_CONFIG.DEFAULT;
}