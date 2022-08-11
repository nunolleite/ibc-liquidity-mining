import { makeIssuerKit } from "@agoric/ertp";

const getInitialSupportedIssuers = () => {
    const moolaKit = makeIssuerKit('Moola');
    const vanKit = makeIssuerKit('Van');

    return {
        moola: moolaKit,
        van: vanKit
    };
};

const getIssuer = name => {
    const { issuer, mint, brand } = makeIssuerKit(name);
    return { issuer, mint, brand };
}

const getGovernanceTokenKit = () => {
    return makeIssuerKit('Gov');
}

export {
    getInitialSupportedIssuers,
    getIssuer,
    getGovernanceTokenKit
}