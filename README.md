# n8n-nodes-bunq

[![npm version](https://img.shields.io/npm/v/n8n-nodes-bunq)](https://www.npmjs.com/package/n8n-nodes-bunq)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An n8n community node package for integrating with the [Bunq API](https://doc.bunq.com). Supports retrieving accounts and payments, creating payments, webhook-based triggers, and authenticated request signing.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

## Table of contents

- [Installation](#installation)
- [Nodes](#nodes)
- [Credentials](#credentials)
- [Compatibility](#compatibility)
- [Usage](#usage)
- [Resources](#resources)
- [Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Nodes

| Node | Type | Description |
|------|------|-------------|
| Bunq Monetary Accounts | Action | Retrieve monetary accounts with type filtering |
| Bunq Payments | Action | Retrieve payments with pagination and date filtering |
| Bunq Create Payment | Action | Create actual or draft payments to any recipient |
| Bunq Trigger | Trigger | Start workflows from Bunq webhook events |
| Bunq Session | Utility | Manage Bunq API sessions manually |
| Sign Request | Utility | Sign request bodies with your Bunq private key |

### Bunq Monetary Accounts

Retrieves monetary accounts from the Bunq API. Each account is returned as a separate n8n item.

**Features:**
- Multiselect filter for account types
- Automatic session management

**Account types:**
- **Bank** — Classic personal or business bank accounts
- **Savings** — Regular or auto-savings accounts (including VAT accounts)
- **Joint** — Shared accounts with other bunq users

### Bunq Payments

Retrieves payments from a specific monetary account with pagination and date filtering.

**Features:**
- Fetch payments for any monetary account by ID
- Full pagination support for large datasets
- Filter payments from the last X days
- Configurable page size (up to 200 items per page)

**Parameters:**
- **Monetary Account ID** — The account to retrieve payments from
- **Limit** _(optional)_ — Maximum number of payments to return; omit for all
- **Last X Days** _(optional)_ — Only return payments from the last X days
- **Items Per Page** _(optional)_ — Items per API request (max 200)

### Bunq Create Payment

Creates payments or draft payments from a Bunq account to any recipient.

**Features:**
- Execute payments immediately or create drafts requiring manual approval
- Send to any recipient via IBAN, email, or phone number
- Validates amount, IBAN, email, and phone number formats

**Parameters:**
- **From Monetary Account ID** — The account to send money from _(required)_
- **Payment Type** — Actual payment or draft payment _(required)_
- **Recipient Type** — IBAN, email, or phone number _(required)_
- **Recipient IBAN / Email / Phone** — The recipient identifier _(required)_
- **Recipient Name** — Optional name for IBAN transfers
- **Amount** — Amount in EUR, e.g. `10.00` _(required)_
- **Description** — Payment description for bookkeeping _(required)_

### Bunq Trigger

Starts your workflow when Bunq sends a webhook notification. Automatically registers and cleans up webhooks with the Bunq API.

**Features:**
- Automatic webhook registration and deregistration
- Support for multiple callback categories
- Automatic session token refresh

**Available callback categories:**
- **Billing** — Bunq invoices
- **bunq.me Tab** — bunq.me Tab payment updates
- **Card Transaction Failed** — Failed card transactions
- **Card Transaction Successful** — Successful card transactions
- **Chat** — Received chat messages
- **Draft Payment** — Draft payment creation and updates
- **iDEAL** — iDEAL deposits
- **Mutation** — Any action affecting a monetary account's balance
- **OAuth** — Revoked OAuth connections
- **Payment** — Payments created or received
- **Request** — Incoming requests and outgoing request updates
- **Schedule Result** — Scheduled payment execution
- **Schedule Status** — Scheduled payment status changes
- **Share** — Connect creation and updates
- **SOFORT** — SOFORT deposits
- **Support** — Support chat messages
- **Tab Result** — Tab payment updates

### Bunq Session

A utility node for creating and managing Bunq API sessions, including installation, device registration, and session token management. Most workflows won't need this node directly, as the other nodes handle sessions automatically.

### Sign Request

Signs request bodies using RSA-SHA256 with your Bunq private key. Useful when making custom Bunq API calls that require request signing outside of the standard nodes.

## Credentials

### Prerequisites

1. A Bunq account (production or sandbox)
2. An API key from your Bunq account
3. An RSA key pair (private and public keys in PEM format)

### Setting up credentials in n8n

1. In n8n, go to **Credentials** → **New**
2. Search for "Bunq API" and select it
3. Fill in the following fields:
   - **Environment** — `Sandbox` for testing, `Production` for live transactions
   - **API Key** — Your Bunq API key
   - **Private Key (PEM)** — Your RSA private key
   - **Public Key (PEM)** — Your RSA public key
4. Click **Save**

### Getting your API key

**Sandbox:** Visit the [Bunq Developer Portal](https://www.bunq.com/developer), create a sandbox account, and generate a sandbox API key.

**Production:** In the Bunq app, go to **Profile → Security & Settings → Developers** and generate an API key.

### Generating RSA keys

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem
```

Copy the contents of `private.pem` and `public.pem` into the respective credential fields.

## Compatibility

- **Minimum n8n version:** 1.55.0
- **Bunq API version:** v1

## Usage

### Using the Bunq Trigger

1. Add the **Bunq Trigger** node to your workflow
2. Select or create your Bunq API credentials
3. Choose one or more callback categories
4. Activate your workflow

The node automatically registers a webhook with Bunq, passes incoming payloads to the next node, and deregisters the webhook when the workflow is deactivated.

**Example:**
```
Bunq Trigger (MUTATION) → IF Node → [Process payment data]
```

### Using Sign Request

Use this node when making custom HTTP calls to the Bunq API that require signed request bodies. Pass in the request body and your private key; the node returns the signature to include in your request headers.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Bunq API documentation](https://doc.bunq.com)
- [Bunq callbacks (webhooks) documentation](https://doc.bunq.com/basics/callbacks-webhooks)
