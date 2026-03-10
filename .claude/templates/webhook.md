# Webhook Template

Pre-configured requirements for implementing webhook handlers.

## Template Variables

- `$PROVIDER` - Webhook provider (stripe, github, slack, etc.)
- `$EVENT` - Event type to handle

## Requirements

### Functional Requirements

1. Create webhook endpoint
2. Verify webhook signature
3. Parse webhook payload
4. Handle specific event types
5. Return appropriate response
6. Implement idempotency

### Technical Requirements

1. **Signature Verification**
   - Verify webhook comes from legitimate source
   - Use provider's signing secret
   - Reject invalid signatures

2. **Idempotency**
   - Store processed event IDs
   - Skip duplicate events
   - Handle retries gracefully

3. **Error Handling**
   - Return 200 for processed events
   - Return 400 for invalid payloads
   - Return 500 and retry for temporary failures

4. **Logging**
   - Log received events
   - Log processing results
   - Don't log sensitive data

### Files to Create/Modify

- `src/webhooks/$PROVIDER.ts` - Main handler
- `src/webhooks/$PROVIDER/events/` - Event handlers
  - `$event.ts` - Specific event handler
- `src/types/webhooks/$PROVIDER.ts` - Payload types
- `tests/webhooks/$PROVIDER.test.ts` - Tests

### Handler Pattern

```typescript
// Webhook handler
export async function handleWebhook(req: Request) {
  // 1. Verify signature
  const signature = req.headers['x-provider-signature'];
  if (!verifySignature(req.body, signature)) {
    return { status: 400, body: 'Invalid signature' };
  }

  // 2. Parse event
  const event = parseEvent(req.body);

  // 3. Check idempotency
  if (await isProcessed(event.id)) {
    return { status: 200, body: 'Already processed' };
  }

  // 4. Handle event
  try {
    await processEvent(event);
    await markProcessed(event.id);
    return { status: 200, body: 'Success' };
  } catch (error) {
    // Return 500 to trigger retry
    return { status: 500, body: 'Processing failed' };
  }
}
```

### Provider-Specific Patterns

**Stripe:**
```typescript
import Stripe from 'stripe';

const event = stripe.webhooks.constructEvent(
  body,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

**GitHub:**
```typescript
import { verify } from '@octokit/webhooks-methods';

const isValid = await verify(
  process.env.GITHUB_WEBHOOK_SECRET,
  body,
  signature
);
```

### Security Checklist

- [ ] Verify webhook signatures
- [ ] Use HTTPS endpoint
- [ ] Validate payload structure
- [ ] Implement rate limiting
- [ ] Store secrets securely
- [ ] Log without sensitive data

### Example Usage

```bash
# Add Stripe webhook
/auto-pipeline --template=webhook "stripe payment_intent.succeeded"

# Add GitHub webhook
/auto-pipeline --template=webhook "github push event"
```
