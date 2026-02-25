# XRS Names Integration Examples

## Integration for XerisProof

Add XRS name support to certificate sender/recipient fields:

```html
<!-- In your certificate form -->
<script type="module">
import { resolveToAddress, toDisplayString } from '/xrs-names-lib.js';

// When sending a certificate
async function sendCertificate() {
    const recipientInput = document.getElementById('recipient').value;
    
    // Resolve name to address (handles both names and addresses)
    const recipientAddress = await resolveToAddress(recipientInput);
    
    // Now use recipientAddress in your transaction
    console.log('Sending to:', recipientAddress);
}

// Display certificate owner with name if available
async function displayCertificate(cert) {
    const ownerDisplay = await toDisplayString(cert.owner);
    document.getElementById('owner').textContent = ownerDisplay;
    // Shows "alice.xrs" if registered, otherwise "Xrs7d1e...AK97"
}
</script>
```

## Integration for FORGE Crowdfunding

Support .xrs names in campaign creator and backers:

```html
<script type="module">
import { resolveToAddress, getPrimaryName, isXRSName } from '/xrs-names-lib.js';

// Create campaign with XRS name
async function createCampaign() {
    const creatorInput = document.getElementById('creator').value;
    const creatorAddress = await resolveToAddress(creatorInput);
    
    // Create campaign with resolved address
    const campaign = {
        creator: creatorAddress,
        title: document.getElementById('title').value,
        // ... other fields
    };
}

// Display campaign creator
async function displayCampaign(campaign) {
    const creatorName = await getPrimaryName(campaign.creator);
    
    document.getElementById('creator').textContent = 
        creatorName || `${campaign.creator.substring(0, 10)}...`;
}

// Validate input field in real-time
document.getElementById('recipient').addEventListener('input', async (e) => {
    const input = e.target.value;
    
    if (isXRSName(input)) {
        const address = await resolveToAddress(input);
        if (address !== input) {
            // Show resolved address as hint
            showHint(`Resolves to: ${address.substring(0, 16)}...`);
        }
    }
});
</script>
```

## Wallet Integration

Add XRS name support to your Xeris wallet:

```javascript
import { resolveXRS, reverseXRS, toDisplayString } from '/xrs-names-lib.js';

class XerisWallet {
    async send(recipient, amount) {
        // Accept both names and addresses
        const recipientAddress = await resolveToAddress(recipient);
        
        // Send transaction to resolved address
        return this.sendTransaction(recipientAddress, amount);
    }

    async getDisplayName(address) {
        // Show name if available, otherwise short address
        return await toDisplayString(address);
    }

    async renderTransactionHistory(txs) {
        for (const tx of txs) {
            const senderName = await toDisplayString(tx.from);
            const recipientName = await toDisplayString(tx.to);
            
            console.log(`${senderName} → ${recipientName}: ${tx.amount} XRS`);
        }
    }
}
```

## Block Explorer Integration

Show names in explorer:

```javascript
import { getPrimaryName } from '/xrs-names-lib.js';

async function displayTransaction(tx) {
    const fromName = await getPrimaryName(tx.from);
    const toName = await getPrimaryName(tx.to);

    document.getElementById('from').innerHTML = `
        ${fromName ? `<strong>${fromName}</strong>` : ''}
        <small>${tx.from}</small>
    `;

    document.getElementById('to').innerHTML = `
        ${toName ? `<strong>${toName}</strong>` : ''}
        <small>${tx.to}</small>
    `;
}
```

## Universal Send Input Component

```html
<!-- Universal address/name input -->
<div class="send-input">
    <input 
        type="text" 
        id="recipient" 
        placeholder="alice.xrs or Xrs7d1e4f..."
        oninput="validateRecipient(this.value)"
    >
    <div id="resolved-address"></div>
</div>

<script type="module">
import { resolveToAddress, isXRSName } from '/xrs-names-lib.js';

let debounceTimer;

async function validateRecipient(input) {
    clearTimeout(debounceTimer);
    
    debounceTimer = setTimeout(async () => {
        if (!input) {
            document.getElementById('resolved-address').innerHTML = '';
            return;
        }

        if (isXRSName(input)) {
            const address = await resolveToAddress(input);
            
            if (address && address !== input) {
                document.getElementById('resolved-address').innerHTML = `
                    ✓ Resolves to: <code>${address}</code>
                `;
            } else {
                document.getElementById('resolved-address').innerHTML = `
                    ❌ Name not found
                `;
            }
        } else {
            // Looks like an address - check if it has a name
            const names = await reverseXRS(input);
            if (names.length > 0) {
                document.getElementById('resolved-address').innerHTML = `
                    ℹ️ Known as: ${names.join(', ')}
                `;
            }
        }
    }, 300);
}

window.validateRecipient = validateRecipient;
</script>
```

## API Configuration

```javascript
// For production, configure with your deployed service URL
import { XRSNames } from '/xrs-names-lib.js';

const xrsNames = new XRSNames('https://xrs-names.your-domain.com/api');

// Use custom instance
const address = await xrsNames.resolve('alice.xrs');
```

## React Component Example

```jsx
import { useState, useEffect } from 'react';
import { toDisplayString } from '/xrs-names-lib.js';

function AddressDisplay({ address }) {
    const [displayName, setDisplayName] = useState('');

    useEffect(() => {
        async function loadName() {
            const name = await toDisplayString(address);
            setDisplayName(name);
        }
        loadName();
    }, [address]);

    return <span>{displayName}</span>;
}
```

## Testing

```javascript
// Test the integration
import { resolveXRS, reverseXRS, isXRSName } from '/xrs-names-lib.js';

// Test name resolution
const addr = await resolveXRS('alice.xrs');
console.log('alice.xrs resolves to:', addr);

// Test reverse lookup
const names = await reverseXRS('Xrs7d1e4f...');
console.log('Names for address:', names);

// Test name detection
console.log(isXRSName('alice.xrs')); // true
console.log(isXRSName('alice')); // true
console.log(isXRSName('Xrs7d1e...')); // false
```
