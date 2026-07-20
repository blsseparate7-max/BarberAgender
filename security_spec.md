# Security Specification: Barbershop Platform Firestore Rules

## 1. Data Invariants
- **Reviews & Ratings (`avaliacoes`)**:
  - `cliente_id` must match the authenticated user's UID (unless written by Staff).
  - Rating must be a numeric value between 1 and 5.
- **Daily Operations Flow (`daily_flow`)**:
  - Managed primarily by barbershop staff or barbers.
  - Clients can only read daily flow data if they are authenticated.
- **Accounts Payable / Receivable (`accounts_payable`, `accounts_receivable`)**:
  - Highly sensitive financial records only readable and writable by Barbearia Staff (`isStaff()`).
- **Client Ledger Notes (`client_ledger_notes`)**:
  - Internal customer-focused notes. Only readable by staff, barbers, or the respective client.
  - Writable only by staff and barbers.
- **Subscriptions / Assinaturas (`subscriptions`, `assinaturas`)**:
  - Subscriptions must be locked to the corresponding client.
  - Normal clients cannot alter subscription amounts or plans.

## 2. The "Dirty Dozen" Payloads (Exploit Scenarios)
1. **Anon Review Inject**: An unauthenticated user attempts to write to `/avaliacoes/test`.
2. **Review Hijack**: Authenticated user `user_A` tries to post a review under `user_B`'s ID.
3. **Out-of-Bounds Rating**: A user tries to post a review with a rating of `100`.
4. **Flow Poisoning**: An authenticated client attempts to inject/modify a ticket in `/daily_flow/test`.
5. **Payable Exfiltration**: An authenticated client tries to fetch `/accounts_payable/some_doc`.
6. **Receivable Poisoning**: An authenticated client attempts to write a fake record to `/accounts_receivable/some_doc`.
7. **Ledger Sniffing**: User `user_A` tries to read the ledger notes `/client_ledger_notes/some_note` belonging to `user_B`.
8. **Ledger Forgery**: An authenticated client tries to create a ledger note in `/client_ledger_notes/test`.
9. **Fake Subscription Injection**: An authenticated client tries to bypass payments by creating an active subscription directly in `/assinaturas/test` or `/subscriptions/test`.
10. **Admin Escalation**: A regular client tries to update their profile (`/usuarios/my_uid`) with `tipo: "admin"`.
11. **Appointment Stealing**: User `user_A` tries to read or update an appointment in `/appointments/appt_B` belonging to `user_B`.
12. **Comanda Tampering**: A client attempts to update a comanda directly to change `totalAmount` or marked as paid.

## 3. Test Runner Strategy
All operations are verified against the standard Firestore emulator/rules processor. The above security payloads return `PERMISSION_DENIED` on evaluation, preserving data integrity and Zero-Trust architecture.
