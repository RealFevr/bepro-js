import Contract from '../utils/Contract';
import Web3Connection from '../Web3Connection';

/**
 * @typedef {Object} IContract~Options
 * @property {boolean} test
 * @property {boolean} localtest ganache local blockchain
 * @property {ABI} abi
 * @property {string} tokenAddress
 * @property {Web3Connection} [web3Connection=Web3Connection] created from params: 'test', 'localtest' and optional 'web3Connection' string and 'privateKey'
 * @property {string} [contractAddress]
 */

/**
 * Contract Object Interface
 * @class IContract
 * @param {IContract~Options} options
 */
class IContract {
  constructor({
    web3Connection = null, // Web3Connection if exists, otherwise create one from the rest of params
    contractAddress = null, // If not deployed
    abi,
    tokenAddress,
    ...params
  }) {
    if (!abi) {
      throw new Error('No ABI Interface provided');
    }

    if (!web3Connection) {
      this.web3Connection = new Web3Connection(params);
      this.web3Connection.start();
    } else {
      this.web3Connection = web3Connection;
    }

    this.params = {
      web3Connection: this.web3Connection,
      abi,
      contractAddress,
      tokenAddress,
      contract: new Contract(this.web3Connection.web3, abi, contractAddress),
    };

    if (this.web3Connection.test) this._loadDataFromWeb3Connection();
  }

  /**
   * Initialize by awaiting {@link IContract.__assert}
   * @function
   * @return {Promise<void>}
   * @throws {Error} if no {@link IContract.getAddress}, Please add a Contract Address
   */
  __init__ = async () => {
    if (!this.getAddress()) {
      throw new Error('Please add a Contract Address');
    }

    await this.__assert();
  };

  /**
   * @function
   * @params {*} f
   * @params {boolean} call
   * @params {*} value
   * @params [function():void] callback
   * @return {Promise<*>}
   */
  __sendTx = async (f, call, value, callback = () => {}) => {
    const __metamaskCall = (acc) => new Promise((resolve, reject) => {
      f.send({
        from: acc,
        value,
        gasPrice: 5000000000,
        gas: 5913388,
      })
        .on('confirmation', (confirmationNumber, receipt) => {
          callback(confirmationNumber);
          if (confirmationNumber > 0) {
            resolve(receipt);
          }
        })
        .on('error', (err) => {
          reject(err);
        });
    });

    if (!this.acc && !call) {
      const address = await this.web3Connection.getAddress();
      return __metamaskCall(address);
    }

    if (this.acc && !call) {
      const data = f.encodeABI();
      return this.params.contract
        .send(this.acc.getAccount(), data, value)
        .catch((err) => {
          throw err;
        });
    }

    if (this.acc && call) {
      return f.call({ from: this.acc.getAddress() }).catch((err) => {
        throw err;
      });
    }

    return f.call().catch((err) => {
      throw err;
    });
  };

  /**
   * Deploy current contract
   * @function
   * @param {*} params
   * @param {function()} callback
   * @return {Promise<*|undefined>}
   */
  __deploy = (params, callback) => this.params.contract.deploy(
    this.acc,
    this.params.contract.getABI(),
    this.params.contract.getJSON().bytecode,
    params,
    callback,
  );

  /**
   * Asserts and uses {@link IContract.params.contract} with {@link IContract.params.abi}
   * @function
   * @void
   * @throws {Error} Contract is not deployed, first deploy it and provide a contract address
   */
  __assert = () => {
    if (!this.getAddress()) {
      throw new Error(
        'Contract is not deployed, first deploy it and provide a contract address',
      );
    }
    /* Use ABI */
    this.params.contract.use(this.params.abi, this.getAddress());
  };

  /**
   * Deploy {@link IContract.params.contract} and call {@link IContract.__assert}
   * @function
   * @param {Object} params
   * @param {function():void} callback
   * @return {Promise<*|undefined>}
   */
  deploy = async ({ callback }) => {
    const params = [];
    const res = await this.__deploy(params, callback);
    this.params.contractAddress = res.contractAddress;
    /* Call to Backend API */
    await this.__assert();
    return res;
  };

  /**
   * @function
   * @description Get Web3 Contract to interact directly with the web3 library functions like events (https://web3js.readthedocs.io/en/v1.2.11/web3-eth-contract.html?highlight=events#contract-events)
   */
  getWeb3Contract() {
    return this.params.contract.getContract();
  }

  /**
   * Set new owner of {@link IContract.params.contract}
   * @param {Object} params
   * @param {Address} params.address
   * @return {Promise<*|undefined>}
   */
  setNewOwner({ address }) {
    return this.__sendTx(
      this.params.contract.getContract().methods.transferOwnership(address),
    );
  }

  /**
   * Get Owner of {@link IContract.params.contract}
   * @returns {Promise<string>}
   */
  owner() {
    return this.params.contract.getContract().methods.owner().call();
  }

  /**
   * Get the paused state of {@link IContract.params.contract}
   * @returns {Promise<boolean>}
   */
  isPaused() {
    return this.params.contract.getContract().methods.paused().call();
  }

  /**
   * (Admins only) Pauses the Contract
   * @return {Promise<*|undefined>}
   */
  pauseContract() {
    return this.__sendTx(
      this.params.contract.getContract().methods.pause(),
    );
  }

  /**
   * (Admins only) Unpause Contract
   * @return {Promise<*|undefined>}
   */
  unpauseContract() {
    return this.__sendTx(
      this.params.contract.getContract().methods.unpause(),
    );
  }

  /**
   * Remove Tokens from other ERC20 Address (in case of accident)
   * @param {Object} params
   * @param {Address} params.tokenAddress
   * @param {Address} params.toAddress
   */
  removeOtherERC20Tokens({ tokenAddress, toAddress }) {
    return this.__sendTx(
      this.params.contract
        .getContract()
        .methods.removeOtherERC20Tokens(tokenAddress, toAddress),
    );
  }

  /**
   * (Admins only) Safeguards all tokens from {@link IContract.params.contract}
   * @param {Object} params
   * @param {Address} params.toAddress
   * @return {Promise<*|undefined>}
   */
  safeGuardAllTokens({ toAddress }) {
    return this.__sendTx(
      this.params.contract.getContract().methods.safeGuardAllTokens(toAddress),
    );
  }

  /**
   * Change token address of {@link IContract.params.contract}
   * @param {Object} params
   * @param {Address} params.newTokenAddress
   * @return {Promise<*|undefined>}
   */
  changeTokenAddress({ newTokenAddress }) {
    return this.__sendTx(
      this.params.contract
        .getContract()
        .methods.changeTokenAddress(newTokenAddress),
    );
  }

  /**
   * Returns the contract address
   * @returns {string|null} Contract address
   */
  getAddress() {
    return this.params.contractAddress;
  }

  /**
   * Get the Ether balance for the current {@link IContract#getAddress} using `fromWei` util of {@link IContract#web3}
   * @returns {Promise<string>}
   */
  async getBalance() {
    const wei = await this.web3.eth.getBalance(this.getAddress());
    return this.web3.utils.fromWei(wei, 'ether');
  }

  /**
   * Verify that current user/sender is admin, throws an error otherwise
   * @async
   * @throws {Error} Only admin can perform this operation
   * @void
   */
  async onlyOwner() {
    /* Verify that sender is admin */
    const adminAddress = await this.owner();
    const userAddress = await this.getUserAddress();
    const isAdmin = adminAddress === userAddress;
    if (!isAdmin) {
      throw new Error('Only admin can perform this operation');
    }
  }

  /**
   * Verify that contract is not paused before sending a transaction, throws an error otherwise
   * @async
   * @throws {Error} Contract is paused
   * @void
   */
  async whenNotPaused() {
    /* Verify that contract is not paused */
    const paused = await this.isPaused();
    if (paused) {
      throw new Error('Contract is paused');
    }
  }

  /**
   * @function
   * @description Load data from Web3Connection object,
   * Called at start when testing or at login on MAINNET
   */
  _loadDataFromWeb3Connection() {
    this.web3 = this.web3Connection.web3;
    this.acc = this.web3Connection.account;

    // update some params properties with new values
    this.params = {
      ...this.params,
      web3: this.web3,
      contract: new Contract(
        this.web3,
        this.params.abi,
        this.params.contractAddress,
      ),
    };
  }

  /** ***** */
  /** Web3Connection functions */
  /** ***** */

  /**
   * @function
   * @description Start the Web3Connection
   */
  start() {
    if (!this.web3Connection.web3) {
      this.web3Connection.start();
    }
    this._loadDataFromWeb3Connection();
  }

  /**
   * @function
   * @description Login with Metamask/Web3 Wallet - substitutes start()
   * @return {Promise<Boolean>} True is login was successful
   */
  async login() {
    const loginOk = await this.web3Connection.login();
    if (loginOk) this._loadDataFromWeb3Connection();
    return loginOk;
  }

  /**
   * @function
   * @description Get ETH Network
   * @return {Promise<string>} Network Name (Ex : Kovan)
   */
  getETHNetwork() {
    return this.web3Connection.getETHNetwork();
  }

  /**
   * Get contract current user/sender address
   * @return {Promise<string>|string}
   */
  getUserAddress() {
    return this.web3Connection.getAddress();
  }

  /**
   * @function
   * @description Get user ETH Balance of Address connected via login()
   * @return {Promise<string>} User ETH Balance
   */
  getUserETHBalance() {
    return this.web3Connection.getETHBalance();
  }
}

export default IContract;
