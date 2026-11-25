# Specifica — Conto Spese 2027

Fonti: `docs/visione.md`, `docs/strategia-2027.md` (privati, con le cifre). Vocabolario: `CONTEXT.md`. Questo file non contiene cifre personali: i numeri da configurare stanno nella strategia.

## Decisioni di impianto

- Si evolve il progetto esistente: pagina statica, login Google, Firestore con cache offline, `logic.js` pura con test.
- Il nuovo modello sostituisce il vecchio nelle stesse collezioni. Nessun backup di Firestore: fino alla migrazione finale i dati sono una copia di prova del foglio "Budgeting 26".
- La migrazione è **ripetibile**: cancella i dati importati e di prova e reimporta dal foglio nel nuovo formato. La migrazione finale la segnala l'utente (può essere prima del 31 dicembre).
- Nessuna categoria nuova oltre a quelle decise (vedi "Categorie").

## Modello dati (Firestore)

Tutto sotto `users/<uid>/`. Ogni campo nuovo è opzionale e la scrittura resta `setDoc(..., {merge: true})` su un solo movimento, con tombstone `x: 1`.

### `spese_mesi/<YYYY-MM>` → `{mov: {<id>: {...}}}`

| Campo | Significato |
|---|---|
| `d` | data `YYYY-MM-DD` |
| `n` | nota libera |
| `e` / `u` | entrata / uscita, importo **intero** pagato o incassato (euro) |
| `c` | categoria o busta; vuoto per giroconti e versamenti della compagna |
| `k` | conto (per un giroconto: conto di partenza) |
| `a` | solo giroconto: conto di arrivo. Una riga, importo in `u` |
| `p` | la mia parte della spesa, se diversa da `u` (Joint o spesa divisa). Il resto è credito |
| `q` | quota del Joint applicata (percentuale) salvata al momento della registrazione, così i movimenti passati non cambiano |
| `l` | lista di etichette |
| `v` | voce del salvadanaio (per esempio assicurazione dentro Auto fissi) |
| `t` | tipo: assente = normale; `g` giroconto; `x2` entrata extra; `vj` versamento della compagna; `cr` credito; `rb` rimborso |
| `b` | solo entrata extra: busta di destinazione scelta |
| `r` | id del credito chiuso da un rimborso |

Regole: un movimento sul Joint ha `u` intero e `p = u × q`. Una spesa divisa con altri ha `p` e crea un credito aperto per `u − p`. Un versamento della compagna (`vj`) conta solo nel saldo del Joint.

### `spese_config/main`

- `categorie`: lista di `{nome, gruppo, budget, joint, taglio, archiviata}`. `budget` è **mensile** (oggi il campo `budget` è annuale e sparisce). `joint` = la spesa passa dal Joint alla quota. `taglio` = priorità di taglio (solo non necessarie).
- `salvadanai`: lista di `{nome, gruppo, conto, voci: [{nome, annuale, data, cicli?, cambio?}], quota?, saldoIniziale: {data, importo}, obiettivo?, sottosaldo?}`. `obiettivo` (opzionale, euro): sotto questo saldo il salvadanaio è "in ammanco" (e, per il fondo emergenze, "toccato") nel suggerimento delle entrate extra. Il saldo include le entrate extra con `b` = nome del salvadanaio. La quota mensile è la somma delle voci o, senza voci, il valore fisso `quota`. Voce: `data` = mese di scadenza `YYYY-MM`; `cicli` = mesi del ciclo (assente = 12); `cambio` = `{da: 'YYYY-MM', quota}`: dal mese `da` la quota della voce è quel valore fisso, al posto di quella calcolata. Il saldo resta uno solo: `v` sul movimento è solo un'etichetta.
- `conti`: lista di `{nome, joint, chiuso, sottosaldi?}`. `joint` = conto comune: le spese su di esso hanno `u` intero con `p` e `q` calcolati dalla quota, e solo su di esso va il versamento della compagna. Un conto chiuso resta nei saldi storici e non accetta movimenti nuovi.
- `quotaJoint`: lista di `{da, pct}`; vale quella con `da` più recente non successiva alla data del movimento.
- `soglie`: `[80, 100]`.
- `etichette`: lista di `{nome, categoria?}`, solo suggerimenti per il campo Etichette (la categoria o il salvadanaio a cui appartengono; senza `categoria` = trasversale, come TCG). Le etichette dei movimenti restano in `l` e compaiono comunque.
- `obiettivi`: lista di `{nome, attuale, desiderato}` (investimenti, rata auto). Nessuna regola automatica.
- `extra`: opzionale, `{soglia: 100, cuscinetto, emergenze, investimenti, tcg}`: soglia e nomi usati dal suggerimento delle entrate extra (default: 100, "Cuscinetto", "Fondo emergenze", "Investimenti", "Fondo TCG").
- `fondoEmergenze`: `{conto, sottosaldo, obiettivo}`. `sottosaldo` = nome del salvadanaio che tiene il fondo (da 3.2 potrà essere un vero sottosaldo del conto); `obiettivo` in euro.
- `investimenti`: `{versato, valore}`, `valore` aggiornato a mano.
- `magazzinoTCG`: valore delle carte, a mano.
- `piani`: mappa `{<YYYY-MM>: {stipendio, righe: [{nome, importo}]}}`, un campo di `spese_config/main`: stipendio del mese e importo assegnato a ogni budget e salvadanaio. Le righe sono un elenco (non una mappa) perché i nomi possono contenere caratteri vietati nelle chiavi, e un salvataggio le sostituisce tutte. Un mese senza piano parte dall'ultimo piano precedente, altrimenti da budget e quote correnti. Il piano non cambia budget né quote: li registra per quel mese. Il giroconto al Joint non è una riga (solo "di cui Joint", informativo).
- `chiusure/<YYYY-MM>`: scelte su avanzi e sfori.
- `revisioni`: data e decisioni di ogni revisione dei conti.

I vecchi campi `gruppi`, `colori` e `budget` annuale vengono ignorati e rimossi dalla migrazione.

## Categorie, etichette, conti

- 17 categorie con budget (strategia A1), più: **Animali** (al posto di Gatta Evie), **Bollette** (al posto di Bollette luce), **Investimenti**, **TCG** (senza budget). Gruppo = proprietà di ogni voce.
- Etichette dentro le categorie e l'ambito trasversale **TCG** (strategia A2).
- Categorie archiviate (solo mesi passati, senza budget, nascoste per movimenti nuovi): Viaggio Jap, Vacanze, Trasloco, Tatuaggio Lione, Documenti, Check Money, Offerte cucci.
- Conti: Revolut, Revolut Joint, Paypal, Contanti, Buoni, TradeRepublic, e **Padel (chiuso a luglio)**: resta con i suoi movimenti, mai spostati su Revolut.
- Sottosaldi solo in Trade Republic: fondo emergenze e investimenti. Nessun sottoconto per il deposito Revolut: resta nel saldo Revolut.
- Salvadanai: tutti sul Revolut, tranne Viaggi di coppia (Joint) e fondo emergenze e investimenti (Trade Republic).

## Regole di calcolo (tutte in `logic.js`, con test)

1. **La mia parte** di un movimento: `p` se presente, altrimenti `u` (e `e` per le entrate). I giroconti, i versamenti della compagna e i crediti aperti non sono mie spese.
2. **Speso di una categoria nel mese** = somma delle mie parti dei movimenti con quella `c` nel mese. Nessun riporto.
3. **Residuo del budget** = budget − speso. **Percentuale usata** = speso / budget, solo di questo mese.
4. **Spendibile** = somma dei residui dei budget del mese (Joint alla mia quota). Esclude salvadanai e fondo emergenze. Non dipende dai saldi dei conti.
5. **Avvisi**: dopo ogni salvataggio, se la percentuale usata di una categoria passa una soglia (80%, 100%) che prima del movimento non era passata, mostra un avviso.
6. **Salvadanaio**: saldo = saldo iniziale + quote mensili accumulate − spese con quella `c`. Mai sotto zero: una spesa che supera il saldo chiede quale altra busta copre la differenza.
7. **Quota di una voce**: `importo ÷ mesi mancanti alla data`; dopo il pagamento si ricalcola sul nuovo ciclo (per esempio ogni 24 mesi). Una voce può avere una quota che cambia a una data.
8. **Quota del Joint**: vale quella con `da` più recente non successiva alla data del movimento. Si salva in `q` e non si ricalcola sui movimenti passati.
9. **Credito**: `u − p` di una spesa divisa. Resta aperto finché un rimborso (`t: rb`, `r: id`) lo chiude. Non entra in budget né spendibile.
10. **Entrata extra**: mai nel mese. Alla registrazione propone una destinazione (sotto una soglia → cuscinetto; sopra → fondo emergenze se toccato, salvadanai in ammanco, livello 3-5 anni, cuscinetto; vendite di carte → fondo TCG). L'utente decide e salva `b`.
11. **Patrimonio** = saldi di tutti i conti, con il Joint alla mia quota, più il valore degli investimenti e il magazzino TCG. Nei conti non entra mai il versamento della compagna come mio.
12. **Posso permettermelo?**: data una spesa ipotetica e una categoria, dice se il residuo basta. Se no, elenca le buste da cui prendere, in ordine di `taglio` (prima le non necessarie con numero più basso).
13. **Chiusura del mese**: per ogni budget con avanzo o sforo, chiede una scelta (avanzo → risparmio o salvadanaio; sforo → quale busta lo copre). Mai automatica.
14. **Tasso di risparmio** = (PAC + cuscinetto + viaggi di coppia) / stipendio. I salvadanai di spese programmate non contano.
15. **Fondo emergenze**: mesi coperti = saldo ÷ necessarie mensili. Ogni uso richiede una nota.
16. **Scadenze**: per ogni voce con data, avvisa se alla scadenza il saldo previsto non basta.

## Schermate

Stesse funzioni su telefono e PC. Sul telefono, un solo flusso veloce per registrare.

- **Home:** spendibile e patrimonio sempre in alto; elenco delle categorie con speso, residuo e percentuale; pulsante grande "Nuovo movimento".
- **Nuovo movimento** (priorità 1): importo, categoria, conto, nota, etichette; scelta "spesa / entrata / giroconto / versamento compagna / credito". Sul Joint: quota automatica. Spesa divisa: la mia parte e il credito. Avviso soglie dopo il salvataggio.
- **Elenco movimenti:** filtri per mese, categoria, conto, etichetta; ricerca nella nota; modifica ed eliminazione.
- **Piano del mese** (priorità 2): stipendio, divisione tra budget e salvadanai, quanto resta da assegnare.
- **Salvadanai:** saldo, quota, voci, scadenze, previsione di copertura.
- **Posso permettermelo?** (priorità 2).
- **Controllo saldi** (priorità 3): per ogni conto, saldo dello strumento accanto a un campo per il saldo della banca e la differenza.
- **Chiusura del mese** (priorità 3): sfori, avanzi, scelte, riepilogo per gruppo e tasso di risparmio, andamento del patrimonio.
- **Configurazione:** categorie, gruppi, etichette, conti, quota del Joint, soglie, obiettivi, salvadanai e voci.
- **Revisione dei conti:** schermata con i numeri veri e un campo per registrare le decisioni.
- **TCG:** saldo dell'etichetta, fondo e magazzino.

## Migrazione del 2026 dal foglio

Script ripetibile (nello stesso stile dell'import attuale, file locale in `dati/`, mai nel repository):

1. Cancella i movimenti dei mesi 2026 e la configurazione precedente (dati di prova inclusi).
2. Mappa le categorie del foglio:
   - Spesa casa e Spesa cibo → Spesa cibo e casa; Hobby, Eventi, Shopping, Vestiti → Shopping & Svago, con il nome vecchio come etichetta; Parrucchiere e Spesa self care → Self care; Medicine e Visite salute → Salute; Manutenzione Auto, Parcheggi, Multe → Auto variabili, con etichetta; Assicurazione auto e Bollo auto → Auto fissi, come voci; Animali resta Animali; Bollette resta Bollette.
   - Compravendita, Tornei TCG, Judge, Judge Venezia, Judge Lucca, Torneo Londra, OP17 Anniversary, Viaggio Barcellona → TCG, con il nome vecchio come etichetta.
   - Stipendio → entrata di tipo stipendio. Rimborso assicurazione, Referral Revolut, Rimborso papa auto → entrate extra.
   - Prestiti → credito. Investimenti e PAC mensile → uscite nella categoria Investimenti.
   - Viaggio Jap, Vacanze, Trasloco, Tatuaggio Lione, Documenti, Check Money, Offerte cucci → categorie archiviate, senza modifiche.
3. Giroconti a due righe → una riga (`k` → `a`).
4. Spese Joint già al 56% → importo intero (`u`), `p` = la parte, `q` = 56 (la quota in vigore nel 2026).
5. Righe senza conto: elencate in un rapporto, non importate in silenzio.
6. Conto Padel: lo importa com'è, `chiuso`.
7. Stampa un rapporto di quadratura (totale per mese e per conto prima e dopo, senza stampare le righe).

I dati del foglio non vanno mai nel repository e non vanno stampati.

## Fuori specifica (per ora)

- Spese ricorrenti automatiche (extra, da verificare prima di registrarle).
- Cambi di categoria (rinomina, unione, eliminazione con scelta sui movimenti passati): ultima attività.
- Livello d'investimento a 20 anni: non deciso.
