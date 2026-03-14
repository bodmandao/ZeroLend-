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


// ── Get all active deposits for a lender ─────────────────────
export async function getDepositsByAddress(lenderAddress: string) {
  const { data } = await supabase
    .from('deposits')
    .select('*')
    .eq('lender_address', lenderAddress)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  return data ?? [];
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

// ── Get existing unredeemed attestation for a wallet ──────────
export async function getExistingAttestation(address: string) {
  const { data } = await supabase
    .from('credit_attestations')
    .select('*')
    .eq('user_address', address)
    .eq('redeemed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data ?? null;
}

// ── Get user loan history for credit prefill ──────────────────
export async function getUserLoanHistory(address: string) {
  const { data } = await supabase
    .from('loans')
    .select('principal, status')
    .eq('borrower_address', address);

  const loans = data ?? [];
  return {
    repaidCount:             loans.filter(l => l.status === 'repaid').length,
    liquidatedCount:         loans.filter(l => l.status === 'liquidated').length,
    totalRepaidVolumeMicro:  loans
      .filter(l => l.status === 'repaid')
      .reduce((sum, l) => sum + (l.principal ?? 0), 0),
  };
}

// ── Insert attestation record ─────────────────────────────────
export async function insertAttestation(params: {
  user_address:    string;
  attestation_id:  string;
  wallet_age_days: number;
  repayments_made: number;
  defaults:        number;
  total_volume:    number;
  computed_score:  number;
  tier:            number;
  tx_id?:          string;
  oracle_address?: string;
  valid_until?:    number;
}) {
  const { error } = await supabase.from('credit_attestations').upsert({
    user_address:    params.user_address,
    attestation_id:  params.attestation_id,
    wallet_age_days: params.wallet_age_days,
    repayments_made: params.repayments_made,
    defaults:        params.defaults,
    total_volume:    params.total_volume,
    computed_score:  params.computed_score,
    tier:            params.tier,
    tx_id:           params.tx_id ?? null,
    oracle_address:  params.oracle_address ?? null,
    valid_until:     params.valid_until ?? null,
    redeemed:        false,
  }, { onConflict: 'user_address' });
  if (error) console.error('[supabase] insertAttestation:', error.message);
}

// ── Save tx_id after attest_credit ───────────────────────────
export async function saveAttestationTxId(userAddress: string, txId: string) {
  const { error } = await supabase
    .from('credit_attestations')
    .update({ tx_id: txId })
    .eq('user_address', userAddress);
  if (error) console.error('[supabase] saveAttestationTxId:', error.message);
}

// ── Get tx_id for latest attestation ─────────────────────────
export async function getAttestationTxId(userAddress: string): Promise<string | null> {
  const { data } = await supabase
    .from('credit_attestations')
    .select('tx_id')
    .eq('user_address', userAddress)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data?.tx_id ?? null;
}

// ── Mark attestation as redeemed ──────────────────────────────
export async function markAttestationRedeemed(attestationId: string) {
  const { error } = await supabase
    .from('credit_attestations')
    .update({ redeemed: true })
    .eq('attestation_id', attestationId);
  if (error) console.error('[supabase] markAttestationRedeemed:', error.message);
}

// ── Insert loan record ────────────────────────────────────────
export async function insertLoan(params: {
  borrower_address: string;
  loan_id_field:    string;
  principal:        number;
  interest_rate:    number;
  tier:             number;
  borrowed_at:      string;
  due_at_block:     number;
  tx_id:            string;
}) {
  const { error } = await supabase.from('loans').insert({
    ...params,
    status: 'active',
  });
  if (error) console.error('[supabase] insertLoan:', error.message);
}

// ── Save tx_id on a loan for record lookup ────────────────────
export async function saveLoanTxId(loanIdField: string, txId: string) {
  const { error } = await supabase
    .from('loans')
    .update({ tx_id: txId })
    .eq('loan_id_field', loanIdField);
  if (error) console.error('[supabase] saveLoanTxId:', error.message);
}

// ── Insert deposit record ─────────────────────────────────────
export async function insertDeposit(params: {
  lender_address: string;
  amount:         number;
  deposit_block:  number;
  deposit_nonce:  string;
  tx_id:          string;
}) {
  const { error } = await supabase.from('deposits').insert({
    ...params,
    status: 'active',
  });
  if (error) console.error('[supabase] insertDeposit:', error.message);
}

// ── Get deposit tx_id for withdrawal ─────────────────────────
export async function getDepositTxId(lenderAddress: string, depositNonce: string): Promise<string | null> {
  const { data } = await supabase
    .from('deposits')
    .select('tx_id')
    .eq('lender_address', lenderAddress)
    .eq('deposit_nonce', depositNonce)
    .single();
  return data?.tx_id ?? null;
}

