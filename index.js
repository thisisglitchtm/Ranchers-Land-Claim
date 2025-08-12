import dotenv from 'dotenv';
dotenv.config();

import { Api, JsonRpc, RpcError } from 'eosjs';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig.js';
import fetch from 'node-fetch';

const { PRIVATE_KEY, OWNER } = process.env;
const CONTRACT = 'ranchersland';
if (!PRIVATE_KEY || !OWNER) {
  console.error('❌ ERROR: Missing PRIVATE_KEY or OWNER in .env');
  process.exit(1);
}

const rpc = new JsonRpc('https://wax.greymass.com', { fetch });
const signatureProvider = new JsSignatureProvider([PRIVATE_KEY]);
const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

let nftMap = {}; // asset_id → {name, secondsLeft, status}
let templateNameMap = {}; // template_id → name

function formatTime(sec) {
  sec = Math.max(sec, 0);
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function renderDashboard() {
  console.clear();
  console.log(`\n=== NFT Claim Dashboard (${new Date().toLocaleTimeString()}) ===`);
  console.log(`OWNER: ${OWNER}\n`);
  console.log(`| NFT ID           | Имя                       | До claim   | Статус               |`);
  console.log(`|------------------|---------------------------|------------|----------------------|`);
  Object.entries(nftMap).forEach(([id, data]) => {
    console.log(
      `| ${id.padEnd(16)} | ${data.name.padEnd(25)} | ${formatTime(data.secondsLeft)} | ${data.status.padEnd(20)} |`
    );
  });
}

// Безопасный запрос с повторами
async function safeGetTableRows(params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await rpc.get_table_rows(params);
    } catch (e) {
      console.error(`[⚠] Ошибка запроса (${i + 1}/${retries}): ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error("get_table_rows: все попытки исчерпаны");
}

async function loadTemplateNames() {
  let lower = '';
  while (true) {
    const res = await safeGetTableRows({
      json: true, code: CONTRACT, scope: CONTRACT,
      table: 'nftconfig', limit: 100, lower_bound: lower
    });
    res.rows.forEach(row => templateNameMap[row.template_id] = row.nft_name);
    if (!res.more) break;
    lower = res.next_key;
  }
}

async function loadStakedNfts() {
  const staked = [];
  let lower = '';
  while (true) {
    const res = await safeGetTableRows({
      json: true, code: CONTRACT, scope: CONTRACT,
      table: 'stakednft', limit: 100, lower_bound: lower
    });
    res.rows.filter(r => r.owner === OWNER).forEach(r => {
      staked.push(r);
      nftMap[r.asset_id] = {
        name: templateNameMap[r.template_id] || 'Unknown',
        secondsLeft: Math.max(r.next_claim - Math.floor(Date.now() / 1000), 0),
        status: r.next_claim <= Math.floor(Date.now() / 1000) ? 'Claim доступен' : 'Ожидание'
      };
    });
    if (!res.more) break;
    lower = res.next_key;
  }
  return staked.map(r => r.asset_id);
}

async function claimNft(asset_id) {
  try {
    nftMap[asset_id].status = 'В процессе claim';
    renderDashboard();
    const result = await api.transact({
      actions: [{
        account: CONTRACT,
        name: 'claimnft',
        authorization: [{ actor: OWNER, permission: 'active' }],
        data: { asset_id, owner: OWNER, wallet: OWNER }
      }]
    }, { blocksBehind: 3, expireSeconds: 30 });
    nftMap[asset_id].status = 'Claim успешен';
    console.log(`[✅] Claim успешен для ${asset_id}. TxID: ${result.transaction_id}`);
  } catch (e) {
    nftMap[asset_id].status = 'Ошибка claim — повтор через 10с';
    renderDashboard();
    if (e instanceof RpcError) console.error(`[❌] RPC ошибка:`, JSON.stringify(e.json, null, 2));
    else console.error(`[❌] Ошибка:`, e);

    // Повтор через 10 секунд
    setTimeout(() => claimNft(asset_id), 10000);
  }
}

async function updateLoop() {
  const now = Math.floor(Date.now() / 1000);
  let needReload = false;

  for (const [id, data] of Object.entries(nftMap)) {
    data.secondsLeft--;
    if (data.secondsLeft <= 0 && data.status !== 'В процессе claim' && !data.status.includes('повтор через')) {
      await new Promise(r => setTimeout(r, 5000));
      await claimNft(id);
      needReload = true;
    }
  }

  if (needReload) {
    await new Promise(r => setTimeout(r, 5000));
    await loadStakedNfts();
  }
  renderDashboard();
}

async function main() {
  await loadTemplateNames();
  await loadStakedNfts();
  renderDashboard();
  setInterval(updateLoop, 1000);
}

main();
