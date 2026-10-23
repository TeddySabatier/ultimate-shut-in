/**
 * Kubernetes deck. Authored from docs/learning/sources/kubernetes.md
 * (kubernetes.io docs, CC BY 4.0: paraphrased with attribution). Original
 * wording throughout; every card cites the exact page it was written from.
 */
import type { Deck } from './schema';

export const KUBERNETES_DECK: Deck = {
  subject: 'kubernetes',
  name: { en: 'Kubernetes', fr: 'Kubernetes' },
  credits: 'Cards paraphrase the Kubernetes documentation (https://kubernetes.io/docs/), Creative Commons Attribution 4.0 (https://github.com/kubernetes/website/blob/main/LICENSE), read at v1.37 on 2026-10-23.',
  topics: [
    { id: 'core-objects', name: { en: 'Core workload objects', fr: 'Objets de base' } },
    { id: 'networking', name: { en: 'Services, Ingress and networking', fr: 'Services, Ingress et réseau' } },
    { id: 'config', name: { en: 'ConfigMaps and Secrets', fr: 'ConfigMaps et Secrets' } },
    { id: 'storage', name: { en: 'Storage', fr: 'Stockage' } },
    { id: 'scheduling', name: { en: 'Scheduling', fr: 'Ordonnancement' } },
    { id: 'lifecycle', name: { en: 'Probes and pod lifecycle', fr: 'Sondes et cycle de vie' } },
    { id: 'rbac', name: { en: 'RBAC and ServiceAccounts', fr: 'RBAC et ServiceAccounts' } },
    { id: 'kubectl', name: { en: 'kubectl fluency', fr: 'Aisance avec kubectl' } },
    { id: 'troubleshooting', name: { en: 'Troubleshooting', fr: 'Dépannage' } },
    { id: 'architecture', name: { en: 'Architecture', fr: 'Architecture' } },
  ],
  cards: [
    {
      id: 'kubernetes-core-objects-01',
      subject: 'kubernetes',
      topic: 'core-objects',
      tier: 1,
      prompt: 'What is the smallest unit Kubernetes schedules and runs?',
      answer: 'A Pod',
      distractors: ['A container', 'A Deployment', 'A node'],
      explanation: 'Kubernetes never schedules a bare container: it places Pods, each wrapping one or more containers that share a network namespace and can share storage.',
      source: 'https://kubernetes.io/docs/concepts/workloads/pods/ | Kubernetes docs v1.37 | checked 2026-10-23',
      sourceUrl: 'https://kubernetes.io/docs/concepts/workloads/pods/',
      accept: ['Pod', 'pods'],
    },
  ],
};
