import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Pool stats helpers ────────────────────────────────────────

export async function getPoolStats() {
  const { data } = await supabase
    .from('pool_snapshots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

export async function upsertPoolSnapshot(stats: {
  total_liquidity: number;
  total_borrowed: number;
  interest_earned: number;
  active_loans: number;
}) {
  return supabase.from('pool_snapshots').insert(stats);
}

// ── Loan tracking ─────────────────────────────────────────────

export async function insertLoan(loan: {
  borrower_address: string;
  loan_id_field: string;
  principal: number;
  interest_rate: number;
  tier: number;
  borrowed_at: string;
  due_at_block: number;
  tx_id: string;
}) {
  return supabase.from('loans').insert({ ...loan, status: 'active' });
}

export async function getLoansByAddress(address: string) {
  return supabase
    .from('loans')
    .select('*')
    .eq('borrower_address', address)
    .order('created_at', { ascending: false });
}

export async function markLoanRepaid(loanIdField: string, txId: string) {
  return supabase
    .from('loans')
    .update({ status: 'repaid', repaid_tx_id: txId })
    .eq('loan_id_field', loanIdField);
}

export async function markLoanLiquidated(loanIdField: string) {
  return supabase
    .from('loans')
    .update({ status: 'liquidated' })
    .eq('loan_id_field', loanIdField);
}

// ── Deposit tracking ──────────────────────────────────────────

export async function insertDeposit(deposit: {
  lender_address: string;
  amount: number;
  deposit_block: number;
  deposit_nonce: string;
  tx_id: string;
}) {
  return supabase.from('deposits').insert({ ...deposit, status: 'active' });
}

export async function getDepositsByAddress(address: string) {
  return supabase
    .from('deposits')
    .select('*')
    .eq('lender_address', address)
    .order('created_at', { ascending: false });
}

// ── Credit attestations ───────────────────────────────────────

export async function insertAttestation(att: {
  user_address: string;
  attestation_id: string;
  wallet_age_days: number;
  repayments_made: number;
  defaults: number;
  total_volume: number;
  computed_score: number;
  tier: number;
}) {
  return supabase.from('credit_attestations').insert({ ...att, redeemed: false });
}

export async function getPendingAttestation(address: string) {
  return supabase
    .from('credit_attestations')
    .select('*')
    .eq('user_address', address)
    .eq('redeemed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
}

export async function markAttestationRedeemed(attestationId: string) {
  return supabase
    .from('credit_attestations')
    .update({ redeemed: true })
    .eq('attestation_id', attestationId);
}

export async function getLatestCreditRecord(address: string) {
  return supabase
    .from('credit_attestations')
    .select('*')
    .eq('user_address', address)
    .eq('redeemed', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
}

// ── Transaction history ───────────────────────────────────────

export async function insertTransaction(tx: {
  user_address: string;
  tx_type: string;
  tx_id: string;
  amount?: number;
  details?: object;
}) {
  return supabase.from('transactions').insert(tx);
}

export async function getTransactionHistory(address: string) {
  return supabase
    .from('transactions')
    .select('*')
    .eq('user_address', address)
    .order('created_at', { ascending: false })
    .limit(20);
}
