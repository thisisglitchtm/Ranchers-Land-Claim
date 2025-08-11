# NFT Auto Claimer for WAX Blockchain / Автоматический Клеймер NFT для блокчейна WAX

---

## English

Automated script to periodically monitor and automatically claim NFTs on the WAX blockchain.  
It fetches all NFTs owned by a specified account, checks the claim availability every minute,  
and sends claim transactions with a 2-second delay between each to avoid network congestion.

### Features

- Automatically fetches all NFTs owned by the configured account.  
- Checks claim availability every 60 seconds.  
- Automatically claims NFTs when available.  
- Adds a 2-second delay between claim transactions to prevent overload.  
- Logs all key events and errors to the console.

### Setup

1. Clone the repository.

2. Create a `.env` file in the root directory with the following variables:

   ```env
   PRIVATE_KEY=your_private_key_here
   OWNER=your_wax_account_name

3. Install dependencies:
   ```env
   npm install $(cat requirements.txt)

4. Run the script:
   ```env
   node index.js
   
### Requirements:

    Node.js 14+
	
    Valid WAX account and private key with claim permissions.
	
    Internet connection to access the WAX RPC endpoint.


 ### If you find this project helpful, please consider supporting its development. Your support is greatly appreciated:
   USDT - TON:
   
	UQA_58GijHs26Ba-mPa7GRXaqOoDbbdZb4TlIx1PGpGTM8Gv
