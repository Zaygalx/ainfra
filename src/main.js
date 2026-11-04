import {
  createPublicClient, createWalletClient, custom, http, parseAbi,
  formatEther, keccak256, toHex,
} from 'viem'

const FACTORY = '0x685d4ACEe100de257b706240FF1fEd78606cD7D0'
const METADATA = 'bafkreidzg7nrut4nhbp7bj36luo6pxez3tsh4tniocxmz4skjphcqrnwmi'
const SALT = keccak256(toHex('ainfra-launch-001'))
const EXPLORER = 'https://robinhoodchain.blockscout.com'

const chain = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: EXPLORER } },
}

const abi = parseAbi([
  'function paused() view returns (bool)',
  'function creationFee() view returns (uint256)',
  'function treasuryBps() view returns (uint16)',
  'function predictToken(address creator, (string name, string symbol, string metadataURI, bytes32 salt, address creatorRecipient, uint16 holdersBps, uint16 creatorBps, uint16 burnBps, uint16 liquidityBps, uint16 maxTreasuryBps, uint256 deadline, (address base, uint16 allocationBps, int24 launchTick, uint128 openingBuy, uint128 minTokensOut)[] pools) p) view returns (address)',
  'function launch((string name, string symbol, string metadataURI, bytes32 salt, address creatorRecipient, uint16 holdersBps, uint16 creatorBps, uint16 burnBps, uint16 liquidityBps, uint16 maxTreasuryBps, uint256 deadline, (address base, uint16 allocationBps, int24 launchTick, uint128 openingBuy, uint128 minTokensOut)[] pools) p) payable returns (address token)',
])

const pools = [
  { base: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', allocationBps: 3000, launchTick: 170820, openingBuy: 0n, minTokensOut: 0n },
  { base: '0x156E175DD063a8cE274C50654eF40e0032b3fbcF', allocationBps: 2000, launchTick: 175500, openingBuy: 0n, minTokensOut: 0n },
  { base: '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD', allocationBps: 2000, launchTick: 185040, openingBuy: 0n, minTokensOut: 0n },
  { base: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A', allocationBps: 1500, launchTick: 168780, openingBuy: 0n, minTokensOut: 0n },
  { base: '0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3', allocationBps: 1500, launchTick: 156960, openingBuy: 0n, minTokensOut: 0n },
]

const publicClient = createPublicClient({ chain, transport: http() })
const $ = id => document.getElementById(id)
const log = msg => { const el = $('log'); el.textContent += (el.textContent ? '\n' : '') + msg }

let account, wallet, fee, treasury, predicted, busy = false

async function connect() {
  if (!window.ethereum) return log('No browser wallet found. Open this page inside your wallet app browser, or install one.')
  busy = true
  try {
    wallet = createWalletClient({ chain, transport: custom(window.ethereum) })
    ;[account] = await wallet.requestAddresses()
    try { await wallet.switchChain({ id: chain.id }) }
    catch (e) {
      if (e.code === 4902 || /Unrecognized chain/i.test(e.message || '')) {
        await wallet.addChain({ chain })
        await wallet.switchChain({ id: chain.id })
      } else throw e
    }
    $('addr').textContent = account
    $('step1').classList.add('done')
    await loadState()
    log('Wallet connected on Robinhood Chain.')
  } catch (e) {
    log('Connect failed: ' + (e.shortMessage || e.message))
  } finally { busy = false; render() }
}

async function loadState() {
  const [p, f, t] = await Promise.all([
    publicClient.readContract({ address: FACTORY, abi, functionName: 'paused' }),
    publicClient.readContract({ address: FACTORY, abi, functionName: 'creationFee' }),
    publicClient.readContract({ address: FACTORY, abi, functionName: 'treasuryBps' }),
  ])
  if (p) throw new Error('Factory is paused, launches revert right now.')
  fee = f; treasury = t
  predicted = await publicClient.readContract({ address: FACTORY, abi, functionName: 'predictToken', args: [account, params(BigInt(Math.floor(Date.now()/1000) + 1200))] })
  $('fee').textContent = formatEther(fee) + ' ETH'
  $('token').textContent = predicted
  $('tokenlink').href = EXPLORER + '/address/' + predicted
  const bal = await publicClient.getBalance({ address: account })
  $('bal').textContent = formatEther(bal) + ' ETH'
  $('warn').style.display = bal >= fee ? 'none' : 'block'
  $('step2').classList.add('done')
}

function params(deadline) {
  return {
    name: 'AI Infrastructure Index',
    symbol: 'AINFRA',
    metadataURI: METADATA,
    salt: SALT,
    creatorRecipient: account,
    holdersBps: 4000,
    creatorBps: 5000,
    burnBps: 0,
    liquidityBps: 1000,
    maxTreasuryBps: treasury,
    deadline,
    pools,
  }
}

async function launch() {
  if (busy || !account) return
  busy = true; render()
  try {
    if (predicted && await publicClient.getCode({ address: predicted }) !== undefined) throw new Error('This token address is already deployed. Salt already used.')
    const deadline = BigInt(Math.floor(Date.now()/1000) + 1200)
    const p = params(deadline)
    const f = await publicClient.readContract({ address: FACTORY, abi, functionName: 'creationFee' })
    log('Confirm one transaction in your wallet: ' + formatEther(f) + ' ETH to the Integral factory.')
    const hash = await wallet.writeContract({
      address: FACTORY, abi, functionName: 'launch', args: [p],
      value: f, account, chain, gas: 3000000n,
    })
    log('Sent: ' + EXPLORER + '/tx/' + hash)
    $('tx').href = EXPLORER + '/tx/' + hash; $('tx').style.display = 'inline'
    const rc = await publicClient.waitForTransactionReceipt({ hash })
    if (rc.status !== 'success') throw new Error('Transaction reverted on chain.')
    log('Launched in block ' + rc.blockNumber + '. Token: ' + predicted)
    $('done').style.display = 'block'
    $('tradelink').href = 'https://tradeintegr.al/t/' + predicted
  } catch (e) {
    log('Launch failed: ' + (e.shortMessage || e.message))
  } finally { busy = false; render() }
}

function render() {
  $('go').disabled = busy || !account
  $('go').textContent = busy ? 'Working...' : 'Launch index, ' + (fee ? formatEther(fee) : '0.002') + ' ETH'
}

$('connect').onclick = connect
$('go').onclick = launch
render()
