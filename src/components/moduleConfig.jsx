export const MODULE_CONFIGS = {
  inpayment: {
    label: "Inpayment",
    messageType: "IPTDEC", // CONFIRMED — from Header.jsx
    hasGst: true,
    hasCoType: false,
    hasCertificateOfOrigin: false,
    declarationTypeEndpoint: "/getDeclarationTypeFromCommonMasterForInpayment/",
    declaringForEndpoint: "/getDeclaringForFromCommonMaster/",
    newPermitEndpoint: (user) => `inpaymentnew/?user=${user}`,
    commonHeaderEndpoint: "/postCommonHeaderTable/",
    mirrorHeaderEndpoint: "inpayment/postInHeaderTable/",
    fileCommonEndpoint: "/postFileTable/",
    fileMirrorEndpoint: "inpayment/postInFileTable/",
    fileDeleteMirrorEndpoint: (permitId, sno) =>
      `inpayment/deleteInFile/${permitId}/${sno}/`,
  },
  innonpayment: {
    label: "In Non-Payment",
    messageType: "INPDEC",
    hasGst: true,
    hasCoType: false,
    hasCertificateOfOrigin: false,
    hasOutwardTransportMode: true,
    declarationTypeEndpoint:
      "/getDeclarationTypeFromCommonMasterForInnonpayment/",
    declaringForEndpoint: "/getDeclaringForFromCommonMaster/",
    newPermitEndpoint: (user) => `innonpaymentNew/?user=${user}`,
    commonHeaderEndpoint: "/postCommonHeaderTable/",
    mirrorHeaderEndpoint: "innonpayment/postInnonHeaderTable/",
    fileCommonEndpoint: "/postFileTable/",
    fileMirrorEndpoint: "innonpayment/postInnonFileTable/",
    fileDeleteMirrorEndpoint: (permitId, sno) =>
      `innonpayment/deleteInnonFile/${permitId}/${sno}/`,
  },
  out: {
    label: "Out",
    messageType: "OUTDEC",
    hasGst: false,
    hasCoType: true,
    hasCertificateOfOrigin: true,
    hasOutwardTransportMode: true,
    coTypeEndpoint: "/getCoTypeFromCommonMasterForOut/",
    certificateTypeEndpoint: "/getCertificateTypeFromCommonMaster",
    declarationTypeEndpoint: "/getDeclarationTypeFromCommonMasterForOut/",
    declaringForEndpoint:
      "/getDeclaringForFromCommonMasterByOutandTranshipment/",
    newPermitEndpoint: (user) => `outNew/?user=${user}`,
    commonHeaderEndpoint: "/postCommonHeaderTable/",
    mirrorHeaderEndpoint: "out/postOutHeaderTable/",
    fileCommonEndpoint: "/postFileTable/",
    fileMirrorEndpoint: "out/postOutFileTable/",
    fileDeleteMirrorEndpoint: (permitId, sno) =>
      `out/deleteOutFile/${permitId}/${sno}/`,
  },
};

export const COMMON_MASTER_ENDPOINTS = {
  cargoPackType: "/getCargoTypeFromCommonMaster/",
  inwardTransportMode: "/getInwardTransportModeFromCommonMaster/",
  bgIndicator: "/getBgIndicatorFromCommonMaster/",
  documentAttachType: "/getDocumentAttachFromCommonMaster/",
};

export function getModuleConfig(moduleKey) {
  return MODULE_CONFIGS[moduleKey] || MODULE_CONFIGS.inpayment;
}
