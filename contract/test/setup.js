//@ts-check

import { makeZoeKit } from "@agoric/zoe"
import { makeFakeVatAdmin } from "@agoric/zoe/tools/fakeVatAdmin.js"
import bundleSource from "@endo/bundle-source";
import { E } from "@endo/eventual-send";
import buildManualTimer from "@agoric/zoe/tools/manualTimer.js"

const setupContract = async () => {
    const { zoeService } = makeZoeKit(makeFakeVatAdmin().admin);
    const  feePurse  = await E(zoeService).makeFeePurse();
    const zoe = E(zoeService).bindDefaultFeePurse(feePurse);

    // @ts-ignore
    const contractPath = new URL('../src/contract.js', import.meta.url).pathname;
    const bundle = await bundleSource(contractPath);
    const installation = await E(zoe).install(bundle);

    const timer = buildManualTimer(console.log);

    return {
        zoe,
        installation,
        timer
    }
};

const initializeContract = async (zoe, installation, terms, issuerKeywordRecord) => {
    const { creatorFacet, publicFacet } = await E(zoe).startInstance(
        installation,
        issuerKeywordRecord,
        terms
      );
    
      return { creatorFacet, publicFacet };
}

export {
    setupContract,
    initializeContract
}