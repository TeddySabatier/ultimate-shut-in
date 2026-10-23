/**
 * eBPF deck. Authored from docs/learning/sources/ebpf.md: ebpf.io (CC BY 4.0)
 * and docs.ebpf.io (BSD-2-Clause) may be paraphrased with attribution; the
 * kernel documentation (GPL-2.0) and the other inspiration-only sources are
 * explained in original words only. Cards assume Linux 6.6 LTS semantics.
 */
import type { Deck } from './schema';

export const EBPF_DECK: Deck = {
  subject: 'ebpf',
  name: { en: 'eBPF', fr: 'eBPF' },
  credits: 'Cards paraphrase ebpf.io (CC BY 4.0) and docs.ebpf.io (isovalent/ebpf-docs, BSD-2-Clause) with attribution; kernel documentation (GPL-2.0), man pages and blogs informed original wording only. Read on 2026-10-23.',
  topics: [
    { id: 'basics', name: { en: 'What eBPF is and the verifier', fr: 'eBPF et le vérificateur' } },
    { id: 'program-types', name: { en: 'Program types and hooks', fr: 'Types de programmes et points d’accroche' } },
    { id: 'maps', name: { en: 'Maps', fr: 'Maps' } },
    { id: 'helpers', name: { en: 'Helpers and tail calls', fr: 'Helpers et tail calls' } },
    { id: 'core-btf', name: { en: 'CO-RE and BTF', fr: 'CO-RE et BTF' } },
    { id: 'toolchains', name: { en: 'Toolchains', fr: 'Outils' } },
    { id: 'lifecycle', name: { en: 'Loading and lifecycle', fr: 'Chargement et cycle de vie' } },
    { id: 'observability', name: { en: 'Observability recipes', fr: 'Recettes d’observabilité' } },
    { id: 'networking-safety', name: { en: 'Networking, safety and limits', fr: 'Réseau, sûreté et limites' } },
  ],
  cards: [
    {
      id: 'ebpf-basics-01',
      subject: 'ebpf',
      topic: 'basics',
      tier: 1,
      prompt: 'Before an eBPF program runs in the kernel, which component checks that it is safe?',
      answer: 'The verifier',
      distractors: ['The JIT compiler', 'The scheduler', 'The loader library'],
      explanation: 'The kernel verifier walks every path of the program before loading it: bounded loops, checked memory access, no crash paths. Only then is it JIT-compiled.',
      source: 'https://ebpf.io/what-is-ebpf/ — 2026-10-23',
      sourceUrl: 'https://ebpf.io/what-is-ebpf/',
      accept: ['verifier', 'eBPF verifier', 'BPF verifier'],
    },
  ],
};
