// @ts-check

import fs from 'fs';
import '@agoric/zoe/exported.js';
import { E } from '@endo/far';
import { resolve as importMetaResolve } from 'import-meta-resolve';
import { lockupStrategies, rewardStrategyTypes } from "../src/definitions.js";
import { AmountMath } from '@agoric/ertp';

const contractRoots = {
  main: '../src/contract.js',
  timer: './faucets/timerFaucet.js',
  tokenFaucet: './faucets/tokenFaucet.js'
}

// This script takes our contract code, installs it on Zoe, and makes
// the installation publicly available. Our backend API script will
// use this installation in a later step.

const makeBundle = async (bundleSource, sourceRoot) => {
  const url = await importMetaResolve(sourceRoot, import.meta.url);
  const path = new URL(url).pathname;
  const contractBundle = await bundleSource(path);
  return contractBundle;
}

/**
 * @template T
 * @typedef {import('@endo/eventual-send').ERef<T>} ERef
 */

/**
 * @typedef {Object} DeployPowers The special powers that agoric deploy gives us
 * @property {(path: string) => string} pathResolve
 *
 * @typedef {Object} Board
 * @property {(id: string) => any} getValue
 * @property {(value: any) => string} getId
 * @property {(value: any) => boolean} has
 * @property {() => [string]} ids
 */

/**
 * @param bundleSource
 * @param {ERef<ZoeService>} zoe
 * @param {ERef<Board>} board
 * @returns {Promise<{ installationBoardId: string, installation: Installation }>}
 */
const installBundle = async (bundleSource, contractName, contractRoot, zoe, board) => {
  // We must bundle up our contract code (./src/contract.js)
  // and install it on Zoe. This returns an installationHandle, an
  // opaque, unforgeable identifier for our contract code that we can
  // reuse again and again to create new, live contract instances.
  const bundle = await makeBundle(bundleSource, contractRoot);
  const installation = await E(zoe).install(bundle);

  // Let's share this installation with other people, so that
  // they can run our contract code by making a contract
  // instance (see the api deploy script in this repo to see an
  // example of how to use the installation to make a new contract
  // instance.)
  // To share the installation, we're going to put it in the
  // board. The board is a shared, on-chain object that maps
  // strings to objects.
  const installationBoardId = await E(board).getId(installation);
  console.log('- SUCCESS! contract code installed on Zoe');
  console.log(`-- Contract Name: ${contractName}`);
  console.log(`-- Installation Board Id: ${installationBoardId}`);
  return { installationBoardId , installation };
};

/**
 * 
 * @param {ERef<ZoeService>} zoe 
 * @param {Installation} installation 
 * @param {Array} initialSupportedIssuers 
 * @param {Brand} governanceTokenBrand
 * @param {Issuer} governanceTokenIssuer
 */
const initializeRootContract = async (zoe, installation, timer, initialSupportedIssuers, governanceTokenBrand, governanceTokenIssuer) => {

  const terms = harden({
    timerService: timer,
    initialSupportedIssuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: {
      type: rewardStrategyTypes.LINEAR,
      definition: 0.5
    },
    gTokenBrand: governanceTokenBrand,
    warnMinimumGovernanceTokenSupply: 10n
  });

  const { creatorFacet, publicFacet } = await E(zoe).startInstance(
    installation,
    { Governance: governanceTokenIssuer},
    terms
  );

  return {
    creatorFacet,
    publicFacet
  }

}

/**
 * 
 * @param {ERef<ZoeService>} zoe 
 * @param {Installation} installation 
 * @param {string} keyword 
 * @returns 
 */
const initializeTokenFaucet = async (zoe, installation, keyword) => {

  const terms = harden({
    keyword,
    displayInfo: {
      decimalPlaces: 8
    }
  });

  const { creatorFacet, publicFacet } = await E(zoe).startInstance(
    installation,
    undefined,
    terms
  );

  return {
    creatorFacet,
    publicFacet
  }
}

/**
 * 
 * @param {ERef<ZoeService>} zoe 
 * @param {*} wallet
 * @param {ERef<*>} faucetPublicFacet 
 * @param {Brand} tokenBrand 
 * @param {bigint} tokenQuantity 
 */
const addAssets = async (zoe, wallet, faucetPublicFacet, issuer, keyword, tokenBrand, tokenQuantity) => {
  const amount = AmountMath.make(tokenBrand, tokenQuantity);
  const proposal = harden({ want: {
    [keyword]: amount
  } });

  const invitation = await E(faucetPublicFacet).makeFaucetInvitation();

  const seat = await E(zoe).offer(
    invitation,
    proposal,
    {}
  )

  const payment = await E(seat).getPayout(keyword);
  const claimedPayment = await E(issuer).claim(payment, amount);

  const purse = await E(wallet).getPurse(keyword);
  const response = await E(purse).deposit(claimedPayment, amount);
  console.log(`--- Deposited - ${response} ---`);
  console.log(await E(purse).getCurrentAmount());
}

/**
 * Primary function that leverages the remaining to deploy and initialize the contract
 */
const deployContract = async (homePromise, { bundleSource, pathResolve }) => {
  // Your off-chain machine (what we call an ag-solo) starts off with
  // a number of references, some of which are shared objects on chain, and
  // some of which are objects that only exist on your machine.

  // Let's wait for the promise to resolve.
  const home = await homePromise;

  // Unpack the references.
  const {
    // *** ON-CHAIN REFERENCES ***

    // Zoe lives on-chain and is shared by everyone who has access to
    // the chain. In this demo, that's just you, but on our testnet,
    // everyone has access to the same Zoe.
    zoe,

    // The board is an on-chain object that is used to make private
    // on-chain objects public to everyone else on-chain. These
    // objects get assigned a unique string id. Given the id, other
    // people can access the object through the board. Ids and values
    // have a one-to-one bidirectional mapping. If a value is added a
    // second time, the original id is just returned.
    board,
    wallet
  } = home;

  console.log("--- Installing contracts ---");

  const [
    { installationBoardId: tokenFaucetInstallationBoardId, installation: tokenFaucetInstallation},
    { installationBoardId: timerInstallationBoardId, installation: timerFaucetInstallation},
    { installationBoardId: mainInstallationBoardId, installation: mainInstallation}
  ] = await Promise.all([
    installBundle(bundleSource, "TokenFaucet", contractRoots.tokenFaucet, zoe, board),
    installBundle(bundleSource, "Timer", contractRoots.timer, zoe, board),
    installBundle(bundleSource, "LiquidityMining", contractRoots.main, zoe, board)
  ]);

  console.log("--- Contracts Installed ---");
  
  console.log("--- Creating Issuers ---");
  const [
    { creatorFacet: moolaCreatorFacet, publicFacet: moolaPublicFacet},
    { creatorFacet: governanceCreatorFacet, publicFacet: governancePublicFacet}
  ] = await Promise.all([
    initializeTokenFaucet(zoe, tokenFaucetInstallation, "Moola"),
    initializeTokenFaucet(zoe, tokenFaucetInstallation, "Governance")
  ]);

  const moolaIssuer = await E(moolaPublicFacet).getIssuer();
  const governanceIssuer = await E(governancePublicFacet).getIssuer();
  const [governanceBrand, moolaBrand] = await Promise.all([
    E(governanceIssuer).getBrand(),
    E(moolaIssuer).getBrand()
  ]);
  const moolaKit = {
    issuer: moolaIssuer,
    brand: moolaBrand
  }
  
  const governanceTokenKit = {
    issuer: governanceIssuer,
    brand: governanceBrand
  }

  const walletBridge = await E(wallet).getBridge();
  const [
    MOOLA_ISSUER_BOARD_ID,
    GOVERNANCE_ISSUER_BOARD_ID
  ] = await Promise.all([
    E(board).getId(moolaKit.issuer),
    E(board).getId(governanceTokenKit.issuer)
  ])

  console.log("--- Creating Timer ---");
  const { creatorFacet: timerCreatorFacet } = await E(zoe).startInstance(
    timerFaucetInstallation
  );

  const timer = await E(timerCreatorFacet).makeManualTimer({
    startValue: 0n,
    timeStep: 1n
  });

  console.log("--- Initializing Contract ---");
  const { creatorFacet, publicFacet } = await initializeRootContract(zoe, mainInstallation, timer, [moolaKit.issuer], await E(governanceIssuer).getBrand(), governanceIssuer);
  console.log("--- Contract Initialized ---");

  const polTokenIssuer = await E(publicFacet).getPolTokenIssuer();
  const polTokenIssuerBoardId = await E(board).getId(polTokenIssuer);

  await Promise.all([
    E(walletBridge).suggestIssuer("Moola", MOOLA_ISSUER_BOARD_ID),
    E(walletBridge).suggestIssuer("Governance", GOVERNANCE_ISSUER_BOARD_ID),
    E(walletBridge).suggestIssuer('POL', polTokenIssuerBoardId)
  ]);

  await addAssets(zoe, wallet, moolaPublicFacet, moolaKit.issuer, 'Moola', moolaKit.brand, 100n * 8n);
  await addAssets(zoe, wallet, governancePublicFacet, governanceTokenKit.issuer, 'Governance', governanceTokenKit.brand, 1000n * 8n);


  const [
    CREATOR_FACET_ID,
    TIMER_SERVICE_ID
  ] = await Promise.all([
    E(home.scratch).set('creator_facet_id', creatorFacet),
    E(home.scratch).set('timer_service_id', timer)
  ]);

  const [
    PUBLIC_FACET_ID,
    MOOLA_ISSUER_ID,
    GOVERNANCE_ISSUER_ID,
    GOVERNANCE_BRAND_ID,
    POL_TOKEN_ISSUER_ID,
  ] = await Promise.all([
    E(board).getId(publicFacet),
    E(board).getId(moolaKit.issuer),
    E(board).getId(governanceTokenKit.issuer),
    E(board).getId(governanceTokenKit.brand),
    E(board).getId(polTokenIssuer)
  ])


  // Save the constants somewhere where the api can find it.
  const dappConstants = {
    CONTRACT_NAME: 'LiquidityMining',
    MAIN_INSTALLATION_BOARD_ID: mainInstallationBoardId,
    CREATOR_FACET_ID,
    TIMER_SERVICE_ID,
    PUBLIC_FACET_ID,
    MOOLA_ISSUER_ID,
    GOVERNANCE_BRAND_ID,
    GOVERNANCE_ISSUER_ID,
    POL_TOKEN_ISSUER_ID,
    MOOLA_PURSE_PETNAME: 'Moola',
    GOVERNANCE_PURSE_PETNAME: 'Governance',
    POL_TOKEN_PURSE_PETNAME: 'POL'
  };
  const defaultsFolder = pathResolve(`../../assets/dapp-constants`);
  const defaultsFile = pathResolve(
    `../../assets/dapp-constants/installationConstants.js`,
  );
  console.log('writing', defaultsFile);
  const defaultsContents = `\
// GENERATED FROM ${pathResolve('./deploy.js')}
export default ${JSON.stringify(dappConstants, undefined, 2)};
`;
  await fs.promises.mkdir(defaultsFolder, { recursive: true });
  await fs.promises.writeFile(defaultsFile, defaultsContents);
};

export default deployContract;
