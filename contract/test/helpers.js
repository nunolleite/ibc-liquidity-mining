import { makeIssuerKit } from "@agoric/ertp";

const getInitialSupportedIssuers = () => {
    const { issuer: moolaIssuer } = makeIssuerKit('Moola');
    const { issuer: vanIssuer } = makeIssuerKit('Van');

    return [moolaIssuer, vanIssuer];
};

const getIssuer = name => {
    const { issuer } = makeIssuerKit(name);
    return issuer;
}

const getGovernanceTokenBrand = () => {
    const { brand: governanceTokenBrand } = makeIssuerKit('Gov');
    return governanceTokenBrand;
}

export {
    getInitialSupportedIssuers,
    getIssuer,
    getGovernanceTokenBrand
}