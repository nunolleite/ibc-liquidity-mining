// @ts-check

import fs from 'fs';
import '@agoric/zoe/exported.js';
import { E } from '@endo/far';
import { resolve as importMetaResolve } from 'import-meta-resolve';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { getInitialSupportedIssuers, getGovernanceTokenKit } from "./test/helpers.js";
import { lockupStrategies, rewardStrategyTypes } from "../contract/src/definitions.js";
import { AmountMath, makeIssuerKit } from '@agoric/ertp';

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
 * @returns {Promise<{ CONTRACT_NAME: string, INSTALLATION_BOARD_ID: string, installation: Installation }>}
 */
const installBundle = async (bundleSource, zoe, board) => {
  // We must bundle up our contract code (./src/contract.js)
  // and install it on Zoe. This returns an installationHandle, an
  // opaque, unforgeable identifier for our contract code that we can
  // reuse again and again to create new, live contract instances.
  const bundle = await makeBundle(bundleSource, './src/contract.js');
  const installation = await E(zoe).install(bundle);

  // Let's share this installation with other people, so that
  // they can run our contract code by making a contract
  // instance (see the api deploy script in this repo to see an
  // example of how to use the installation to make a new contract
  // instance.)
  // To share the installation, we're going to put it in the
  // board. The board is a shared, on-chain object that maps
  // strings to objects.
  const INSTALLATION_BOARD_ID = await E(board).getId(installation);
  const CONTRACT_NAME = 'LiquidityMining';
  console.log('- SUCCESS! contract code installed on Zoe');
  console.log(`-- Contract Name: ${CONTRACT_NAME}`);
  console.log(`-- Installation Board Id: ${INSTALLATION_BOARD_ID}`);
  return { CONTRACT_NAME, INSTALLATION_BOARD_ID , installation };
};

/**
 * 
 * @param {ERef<ZoeService>} zoe 
 * @param {Installation} installation 
 * @param {Array} initialSupportedIssuers 
 * @param {Brand} governanceTokenBrand
 * @param {Issuer} governanceTokenIssuer
 */
const initializeContract = async (zoe, installation, initialSupportedIssuers, governanceTokenBrand, governanceTokenIssuer) => {
  const timer = buildManualTimer(message => {});

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
    publicFacet,
    timer
  }

}

/**
 * 
 * @param {*} wallet 
 * @param {IssuerKit} moolaKit 
 * @param {String} moolaIssuerBoardId 
 * @param {IssuerKit} governanceKit 
 * @param {String} governanceIssuerBoardId 
 */
const addAssets = async (wallet, moolaKit, moolaIssuerBoardId, governanceKit, governanceIssuerBoardId) => {
  const walletBridge = await E(wallet).getBridge();
  await Promise.all([
    E(walletBridge).suggestIssuer("Moola", moolaIssuerBoardId),
    E(walletBridge).suggestIssuer("Governance", governanceIssuerBoardId)
  ]);

  const moolaPurse = await E(wallet).getPurse("Moola");
  const governancePurse = await E(wallet).getPurse("Governance");

  const moolaAmount = AmountMath.make(moolaKit.brand, 10n);
  const moolaPayment = moolaKit.mint.mintPayment(moolaAmount);
  const governanceAmount = AmountMath.make(governanceKit.brand, 50n);
  const governancePayment = governanceKit.mint.mintPayment(governanceAmount);

  await moolaPurse.deposit(moolaPayment);
  await governancePurse.deposit(governancePayment);
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

  const { CONTRACT_NAME, INSTALLATION_BOARD_ID, installation } = await installBundle(
    bundleSource,
    zoe,
    board,
  );
  
  console.log("--- Creating Issuer Kits ---");
  const moolaIssuer = await E(wallet).getIssuer("BLD");
  const issuers = {
    moola: {
      issuer: moolaIssuer
    }
  }
  const governanceTokenIssuer = await E(wallet).getIssuer("RUN");
  const governanceTokenBrand = await E(governanceTokenIssuer).getBrand();
  const governanceTokenKit = {
    brand: governanceTokenBrand,
    issuer: governanceTokenIssuer
  }

  console.log("--- Initializing Contract ---");
  const { creatorFacet, publicFacet, timer } = await initializeContract(zoe, installation, [issuers.moola.issuer], governanceTokenKit.brand, governanceTokenKit.issuer);
  console.log("--- Contract Initialized ---");

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
    GOVERNANCE_BRAND_ID
  ] = await Promise.all([
    E(board).getId(publicFacet),
    E(board).getId(issuers.moola.issuer),
    E(board).getId(governanceTokenKit.issuer),
    E(board).getId(governanceTokenKit.brand)
  ])

  // console.log("--- Adding some assets to the wallet for testing ---");
  // await addAssets(wallet, issuers.moola, MOOLA_ISSUER_ID, governanceTokenKit, GOVERNANCE_ISSUER_ID);
  // console.log("--- Assets added ---");


  // Save the constants somewhere where the api can find it.
  const dappConstants = {
    CONTRACT_NAME,
    INSTALLATION_BOARD_ID,
    CREATOR_FACET_ID,
    TIMER_SERVICE_ID,
    PUBLIC_FACET_ID,
    MOOLA_ISSUER_ID,
    GOVERNANCE_BRAND_ID,
    GOVERNANCE_ISSUER_ID
  };
  const defaultsFolder = pathResolve(`../assets/dapp-constants`);
  const defaultsFile = pathResolve(
    `../assets/dapp-constants/installationConstants.js`,
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
