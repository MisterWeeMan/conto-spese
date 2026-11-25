# Piano di sviluppo — fino all'1 gennaio 2027

Ogni attività è piccola e si prova su soldi veri (o dati di prova) prima della successiva. La logica va test per test (`node --test`), la UI si prova su telefono e PC. Dipendenze tra parentesi. Date di inizio 22/11/2026.

## Priorità 1 — registrazione veloce (entro 30/11)

| # | Attività | Dipende da | Data |
|---|---|---|---|
| 1.1 ✔ | Nuovo formato movimento in `logic.js`: `p`, `q`, `l`, `a`, `t`, con test. `parseAmount`, `movs`, `net` restano. Fatto: `mia` e `credito`, commit `9bdfb8d` (locale). Da ricordare in 1.7: `mia` deve dare 0 anche per `t: rb` (rimborso) e `t: x2` (entrata extra). | — | 23/11 |
| 1.2 ✔ | Configurazione: categorie con gruppo, conti con flag `chiuso`, `quotaJoint` con data. Test sulla quota valida in una data. Fatto: `quotaJoint` (null se nessuna voce vale), `contiAttivi`, `categorieAttive`. Leggono la config nuova (oggetti): `categorie()` e `calcola` leggono ancora la vecchia, da sostituire in 1.7. | 1.1 | 24/11 |
| 1.3 ✔ | Giroconto in una riga (da → a), fuori dai totali. Fatto: `saldi(mesi)` (saldo per conto, senza saldi iniziali) e `calcola` salta `t: 'g'`. Il modulo in `index.html` non c'è ancora: da fare in 1.9 (scelta "giroconto" e conto di arrivo; l'elenco mostra solo il conto di partenza). | 1.1 | 25/11 |
| 1.4 | Quota Joint automatica: `u` intero, `p` calcolata, `q` salvata. | 1.2 | 25/11 |
| 1.5 | Spesa divisa con altri e credito aperto, rimborso che lo chiude. | 1.1 | 26/11 |
| 1.6 | Etichette e nota libera nel modulo. Versamento della compagna (`vj`) solo nel saldo Joint. | 1.1, 1.4 | 27/11 |
| 1.7 | Calcolo del mese: speso, residuo, percentuale, **spendibile**; sostituisce `calcola`. | 1.1–1.5 | 28/11 |
| 1.8 | Avvisi a soglia (80%, 100%) dopo il salvataggio. | 1.7 | 29/11 |
| 1.9 | Modulo "Nuovo movimento" ridisegnato per telefono, home con spendibile. Prova a mano su dati di prova. | 1.3–1.8 | 30/11 |

## Priorità 2 — piano del mese e "posso permettermelo?" (entro 15/12)

| # | Attività | Dipende da | Data |
|---|---|---|---|
| 2.1 | Salvadanai: modello, saldo iniziale (B3), saldo mai sotto zero, conto di appartenenza anche Joint (B4). | 1.7 | 2/12 |
| 2.2 | Voci con un solo saldo (B1) e quota da obiettivo e data con cambio programmato (B2). | 2.1 | 4/12 |
| 2.3 | Piano del mese: stipendio, divisione tra budget e salvadanai, quanto resta da assegnare. | 2.1 | 7/12 |
| 2.4 | Configurazione iniziale con i numeri di `strategia-2027.md` (categorie, gruppi, budget, salvadanai, soglie). | 2.2, 2.3 | 8/12 |
| 2.5 | Priorità di taglio per busta (B6) e "posso permettermelo?". | 1.7, 2.4 | 10/12 |
| 2.6 | Entrata extra con destinazione scelta e suggerimento (B10). Prima entrata vera: la tredicesima. | 2.1 | 12/12 |
| 2.7 | Fondo emergenze con mesi coperti e promemoria (B7). | 2.1 | 14/12 |

## Priorità 3 — controllo e chiusura (entro 31/12)

| # | Attività | Dipende da | Data |
|---|---|---|---|
| 3.1 | Controllo saldi settimanale: saldo strumento, saldo banca, differenza. | 1.3 | 17/12 |
| 3.2 | Sottosaldi di Trade Republic e investimenti con versato e valore (B8). | 2.1, 3.1 | 18/12 |
| 3.3 | Chiusura del mese: sfori, avanzi, scelte esplicite. | 2.4 | 21/12 |
| 3.4 | Riepilogo per gruppo, andamento del patrimonio, tasso di risparmio (B12). | 3.3, 3.2 | 23/12 |
| 3.5 | Migrazione del 2026 ripetibile dal foglio, con rapporto di quadratura. | 1.1–1.5, 2.4 | 24–27/12 |
| 3.6 | Migrazione finale (la segnala l'utente), controllo dei saldi, foglio in sola lettura. | 3.5 | 28–31/12 |

## Extra (dopo la priorità 3, se resta tempo)

| # | Attività | Dipende da |
|---|---|---|
| 4.1 | Saldo dell'etichetta TCG, fondo TCG e magazzino (B9). | 2.1, 3.5 |
| 4.2 | Proiezione a fine anno e previsione di copertura delle scadenze (B11). | 2.2 |
| 4.3 | Revisione dei conti e obiettivi di quota (B5), da fine marzo 2027. | 3.4 |
| 4.4 | Spese ricorrenti automatiche, da verificare prima di registrarle. | 1.9 |

## Ultima

| # | Attività | Dipende da |
|---|---|---|
| 5.1 | Cambi di categoria: rinomina, unione, eliminazione con scelta sui movimenti passati. `rinomina` esiste già. | 1.2 |

## Calendario: i numeri

- **Priorità 1:** 9 attività in 8 giorni (23-30/11), circa una al giorno. È stretta: ogni attività deve restare piccola e il test viene scritto prima del codice.
- **Priorità 2:** 7 attività in 14 giorni. Regge. La configurazione iniziale (2.4) è il 8/12, in tempo per il piano vero dello stipendio (5-10/12) solo se 2.1, 2.2 e 2.3 non scivolano.
- **Priorità 3 e migrazione:** 6 attività in 14 giorni. La migrazione (3.5) dipende da quasi tutto il modello: se la priorità 2 sfora, questa è la prima a soffrire.
- **Rischio nei numeri:** il calendario regge solo se non c'è nessuna settimana vuota. Una settimana persa in P1 spinge P2 oltre lo stipendio; una persa in P2 mette la migrazione dopo il 31/12.

## Primo passo

Attività 1.1: scrivere il primo test fallente per il nuovo movimento (`p` e `q`) in `tests/logic.test.js`.
