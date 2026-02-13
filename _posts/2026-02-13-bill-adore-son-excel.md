---
layout: post
title: "Bill adore Excel. On ne va pas lui enlever."
description: "Comment synchroniser un ERP avec les fichiers Excel d'un superviseur de production — sans changer son workflow. Un use case réel avec Claude et le Cowork Connector Hub."
date: 2026-02-13
image: '/images/Use-case manufacturier.png'
tags: [ia-appliquée, manufacturier, erp, automatisation]
---

Dans chaque usine, il y a un Bill. Il gère la production, le shipping et les achats dans des fichiers Excel. Il retranscrit dans l'ERP quand ça lui tente. Les données sont toujours en retard, jamais synchronisées, et tout le monde attend après Bill.

> « Mon Excel marche bien, pourquoi je changerais? »
> — Bill Tremblay, superviseur de production, 22 ans d'ancienneté

---

## Le problème : l'île de données de Bill

Les fichiers Excel de Bill sont la source de vérité — mais personne d'autre n'y a accès en temps réel.

**La réalité actuelle :**

- 3 fichiers Excel non connectés au système
- Données ERP en retard de 1 à 3 jours
- Saisie manuelle = erreurs de transcription
- Bill est le seul à savoir le vrai statut de la production
- 10+ appels par jour : *« c'est quoi le statut? »*
- Le directeur des ops n'a jamais le bon chiffre
- Et surtout : Bill refuse de changer de système

**Avec le Cowork Connector Hub :**

- Bill garde ses Excel (rien ne change pour lui)
- Claude lit les fichiers automatiquement
- L'ERP se synchronise en temps réel
- Tout le monde a les bonnes données
- Plus d'appels — on demande à Claude
- Le dashboard ERP est toujours à jour
- Bill ne sait même pas que ça sync

---

## Le fameux fichier de Bill

`Production-Schedule-FINAL-v3-VRAI.xlsx` — Bill le met à jour à la main tous les jours. C'est son bébé.

| # | Bon Prod | Client | Qté | Statut | Promis | Shipping | Notes |
|---|----------|--------|-----|--------|--------|----------|-------|
| 1 | BP-2201 | MFG Corp | 150 | FINI | Fév 05 | PRÊT | Palette A3 |
| 2 | BP-2202 | Steel Plus | 80 | 75% | Fév 08 | — | Manque vis M8 |
| 3 | BP-2203 | Acier Pro | 200 | RETARD | Fév 06 | — | Soudure prob. |
| 4 | BP-2204 | MétallTech | 45 | FINI | Fév 10 | EXPÉDIÉ | Purolator #PU882 |
| 5 | BP-2205 | FabriMax | 320 | 40% | Fév 14 | — | Découpe en cours |
| 6 | BP-2206 | Construx Inc | 90 | FINI | Fév 09 | PRÊT | Pickup demain AM |

Ce fichier existe sur le desktop de Bill (ou son OneDrive). L'ERP, lui, montre encore BP-2203 comme « en production 60% » — parce que Bill n'a pas eu le temps de le mettre à jour. Les données sont en retard de 2 jours dans le système officiel.

---

## Marie demande à Claude

Marie, la directrice des ops, ne veut plus appeler Bill. Elle demande à Claude.

**Claude lit le fichier de production de Bill et compare avec l'ERP :**

```
📗 cowork_read_file → Production-Schedule-2026-FEV.xlsx (OneDrive Bill)
   ✓ 1.2s
   lignes: 6 bons de production
   dernière_modif: "2026-02-08 07:42" (ce matin)
   finis: 3  en_cours: 2  en_retard: 1

🏭 acme_get_production_orders → 6 bons de production février
   ✓ 380ms
```

### 4 écarts détectés sur 6 bons

| Bon Prod | Champ | ERP (ancien) | → | Excel Bill (réel) |
|----------|-------|-------------|---|-------------------|
| BP-2201 | Statut | En assemblage 90% | → | FINI + Prêt à shipper |
| BP-2202 | Progrès | 50% | → | 75% (manque vis M8) |
| BP-2203 | Statut | En production 60% | → | RETARD — prob. soudure |
| BP-2204 | Shipping | Non expédié | → | EXPÉDIÉ — Purolator #PU882 |

### 2 alertes critiques

🔴 **BP-2203 (Acier Pro)** — L'ERP dit « 60% en production » mais Bill note un retard avec problème de soudure. Client promis le 6 février, on est le 8. Retard non visible dans l'ERP.

🟡 **BP-2202 (Steel Plus)** — Manque des vis M8 selon Bill. Pourrait retarder la livraison du 8 février (aujourd'hui).

Claude propose alors de synchroniser l'ERP avec les vraies données — en un clic.

---

## Sync + Actions proactives

Après la synchronisation, Claude ne s'arrête pas là. Il va chercher plus loin.

**Vérification du stock de vis M8 :**

```
🏭 acme_get_inventory → Stock vis M8 — tous entrepôts
   ✓ 245ms
   vis_M8_stock: 0 unités (entrepôt principal)
   dernière_réception: "2026-01-22"
   PO_en_cours: "PO-4401" — 500 vis — ETA 10 fév
   fournisseur: "Boulons Québec Inc."
```

Stock de vis M8 = 0. Mais une commande de 500 vis est en route (PO-4401), arrivée prévue le 10 février. BP-2202 (Steel Plus) ne pourra pas être complété avant le 10.

Claude propose de notifier le client Acier Pro du retard, de vérifier les pièces de remplacement pour la soudure, et de préparer les emails de communication — tout ça sans que Bill ait eu à lever le petit doigt.

---

## L'impact — chaque jour

| Métrique | Résultat |
|----------|----------|
| ⏱️ Temps sauvé | **45 min/jour** — Bill ne retranscrit plus. Marie ne rappelle plus. |
| 🎯 Erreurs de transcription | **0** — Données lues directement du fichier source. |
| 😌 Changement pour Bill | **0** — Son Excel est intact. Son workflow aussi. |

---

## La clé de l'approche

Bill n'a jamais été dérangé. Il n'a pas changé de workflow. Il n'a pas appris un nouveau système. Son Excel est toujours sa source de vérité — mais maintenant, Claude fait le pont vers l'ERP automatiquement.

**Le changement est invisible pour l'utilisateur réfractaire.**

Applicable partout : chaque usine a des « îles de données » — schedules de production en Excel, logs de qualité sur papier, bons de livraison dans un dossier partagé. Le Connector Hub n'oblige personne à changer. Il connecte ce qui existe déjà et synchronise les systèmes en arrière-plan.

---

*Bill garde son Excel. L'ERP est toujours à jour. Tout le monde est content.*

**Cowork Connector Hub — par [Boreal42](https://boreal42.com)**
