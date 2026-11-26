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
| `t` | tipo: assente = normale (spesa o entrata); `g` giroconto; `vj` versamento della compagna; `cr` credito; `rb` rimborso. `x2` (entrata extra) non si scrive più dall'attività R3: i movimenti vecchi si leggono come un'entrata in una categoria che non finanzia il mese |
| `b` | solo entrata in una categoria che non finanzia il mese: busta di destinazione scelta (vuoto altrimenti) |
| `r` | id del credito chiuso da un rimborso |
| `ss` | nome del sottosaldo del conto (3.2, solo Trade Republic). Giroconto: il sottosaldo del conto di arrivo se ne ha, altrimenti quello del conto di partenza; altri movimenti: sottosaldo del conto `k`. Vuoto o assente = non assegnato. Sempre scritto, come gli altri campi |

Regole: un movimento sul Joint ha `u` intero e `p = u × q`. Una spesa divisa con altri ha `p` e crea un credito aperto per `u − p`. Un versamento della compagna (`vj`) conta solo nel saldo del Joint.

### `spese_config/main`

- `categorie`: lista di `{nome, gruppo, budget, joint, taglio, archiviata, entrata?, finanzia?}`. `entrata: true` = **categoria di entrata** (Stipendio, Tredicesima, Rimborsi, Vendita carte, Altro): non ha budget, gruppo né `taglio` (la validazione lo rifiuta), non compare tra le categorie di spesa e un movimento di entrata ne sceglie una. `finanzia: true` (solo su una categoria di entrata, di norma Stipendio) = un'entrata in questa categoria finanzia il mese; le altre non toccano il mese e propongono una destinazione. `budget` è **mensile** (oggi il campo `budget` è annuale e sparisce). `joint` = il budget della categoria è sul conto Joint (già la mia quota): serve al "di cui Joint" del piano del mese (`piano(...).joint`); si imposta dalla pagina Categorie (colonna Joint e modulo, solo categorie di spesa), nessun altro effetto sui calcoli. `taglio` = priorità di taglio (solo non necessarie).
  - `taglio` è un intero positivo **unico** tra le categorie non archiviate; vuoto = fuori classifica. Un numero già usato sposta in giù di uno la catena sotto; togliere il numero non rinumera (i buchi restano). Le archiviate non partecipano (`riordinaTaglio` in `logic.js`).
- `salvadanai`: lista di `{nome, gruppo, conto, voci: [{nome, annuale, data, cicli?, cambio?}], quota?, saldoIniziale: {data, importo}, obiettivo?, sottosaldo?}`. `obiettivo` (opzionale, euro): sotto questo saldo il salvadanaio è "in ammanco" (e, per il fondo emergenze, "toccato") nel suggerimento delle entrate extra. Il saldo include le entrate extra con `b` = nome del salvadanaio. La quota mensile è la somma delle voci o, senza voci, il valore fisso `quota`. Voce: `data` = mese di scadenza `YYYY-MM`; `cicli` = mesi del ciclo (assente = 12); `cambio` = `{da: 'YYYY-MM', quota}`: dal mese `da` la quota della voce è quel valore fisso, al posto di quella calcolata. Il saldo resta uno solo: `v` sul movimento è solo un'etichetta.
- `conti`: lista di `{nome, joint, chiuso, saldoIniziale?, sottosaldi?: [{nome, saldoIniziale?}]}`. `saldoIniziale = {data, importo}` (importo anche negativo o 0): il saldo del conto nello strumento parte da lì e conta solo i movimenti dalla `data` in poi (`saldi(mesi, cfg, finoA)`). `joint` = conto comune: le spese su di esso hanno `u` intero con `p` e `q` calcolati dalla quota, e solo su di esso va il versamento della compagna. Un conto chiuso resta nei saldi storici e non accetta movimenti nuovi. **Sottosaldi** (3.2): parti del conto (Trade Republic: fondo emergenze e investimenti), ognuna con il proprio `saldoIniziale` (conta dalla data più recente tra la sua e quella del conto). Il saldo di un sottosaldo = iniziale + movimenti con `ss` = nome; la somma dei sottosaldi più il **non assegnato** (saldo del conto − somma, può essere negativo) fa il saldo del conto intero di `saldi()`, quello da confrontare con la banca. Nessun sottoconto per il deposito Revolut: resta nel saldo Revolut.
- `controlli`: lista di `{d, k, banca, strumento, diff}`, un controllo dei saldi (3.1): data, conto, saldo letto nell'app della banca, saldo dello strumento in quel momento e `diff = banca − strumento`. Un solo campo di `spese_config/main` (lista intera, come `piani`); un nuovo controllo dello stesso conto nello stesso giorno sostituisce il precedente. Non crea mai movimenti di correzione. Il controllo è in ritardo se l'ultimo ha più di 7 giorni o non c'è; i conti chiusi non si controllano.
- `quotaJoint`: lista di `{da, pct}`; vale quella con `da` più recente non successiva alla data del movimento.
- `soglie`: `[80, 100]`.
- `etichette`: lista di `{nome, categoria?}`, solo suggerimenti per il campo Etichette (la categoria o il salvadanaio a cui appartengono; senza `categoria` = trasversale, come TCG). Le etichette dei movimenti restano in `l` e compaiono comunque.
- `obiettivi`: lista di `{nome, attuale, desiderato}` (investimenti, rata auto). Nessuna regola automatica.
- `extra`: opzionale, `{soglia: 100, cuscinetto, emergenze, investimenti, tcg}`: soglia e nomi usati dal suggerimento delle entrate extra (default: 100, "Cuscinetto", "Fondo emergenze", "Investimenti", "Fondo TCG").
- `fondoEmergenze`: `{conto, sottosaldo, obiettivo}`. `sottosaldo` = nome del sottosaldo del `conto` che tiene il fondo (3.2: il saldo viene da lì); se il conto non ha un sottosaldo con quel nome vale ancora il nome di un salvadanaio (2.7, dati di prova). `obiettivo` in euro.
- `investimenti`: `{conto, sottosaldo, valore: [{d, importo}]}` (3.2). `versato` non si salva: è il saldo del sottosaldo (iniziale + soldi messi, al netto di quelli tolti). `valore` = valori inseriti a mano con la data; vale l'ultimo. Differenza = valore − versato (plusvalenza o minusvalenza). Il PAC si registra come giroconto con `ss` = il sottosaldo investimenti.
- `magazzinoTCG`: valore delle carte, a mano: lista `{d, importo}` (vale l'ultimo valore non successivo alla data; accettato anche un numero solo). Parte del patrimonio.
- `risparmioMin`: minimo del tasso di risparmio in percentuale (default 10), solo da import. Nomi dei salvadanai del tasso: `extra.cuscinetto` e `extra.viaggi` (default Cuscinetto, Viaggi di coppia).
- `piani`: mappa `{<YYYY-MM>: {stipendio, righe: [{nome, importo}]}}`, un campo di `spese_config/main`: stipendio del mese e importo assegnato a ogni budget e salvadanaio. Le righe sono un elenco (non una mappa) perché i nomi possono contenere caratteri vietati nelle chiavi, e un salvataggio le sostituisce tutte. Un mese senza piano parte dall'ultimo piano precedente, altrimenti da budget e quote correnti. Il piano non cambia budget né quote: li registra per quel mese. Il giroconto al Joint non è una riga (solo "di cui Joint", informativo).
- `chiusure`: mappa `{<YYYY-MM>: {d, righe: [{c, tipo, importo, a, coperto}]}}`, un campo di `spese_config/main` (come `piani` e `controlli`, non un documento a parte). Una chiusura del mese (3.3): `d` = data in cui è stata fatta; ogni riga è una categoria di spesa con avanzo (`tipo: 'avanzo'`) o sforo (`'sforo'`), `importo` = differenza assoluta, `a` = scelta ('' = avanzo che resta sul conto come risparmio, sforo non coperto). Avanzo: `a` è un salvadanaio e gli va `importo − coperto`; `coperto` = quanto di quell'avanzo ha coperto altri sfori. Sforo: `a` è un salvadanaio (gli si toglie `coperto`) o una busta con `taglio` e avanzo nello stesso mese (il suo avanzo cala di `coperto`); `importo − coperto` = scoperto. Non scrive movimenti: il saldo di un salvadanaio legge le righe (`saldoSalvadanaio(mesi, sv, ym, chiusure)`) dal mese della chiusura in poi. Un mese si chiude una volta; si riapre (cancella la chiusura) solo finché il mese dopo non è chiuso.
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
2. **Speso di una categoria nel mese** = somma delle mie parti delle **spese** con quella `c` nel mese. Nessun riporto. Un'entrata non riduce mai lo speso, qualunque sia la sua categoria.
3. **Residuo del budget** = budget − speso. **Percentuale usata** = speso / budget, solo di questo mese.
4. **Spendibile** = somma dei residui dei budget del mese (Joint alla mia quota). Esclude salvadanai e fondo emergenze. Non dipende dai saldi dei conti.
5. **Avvisi**: dopo ogni salvataggio, se la percentuale usata di una categoria passa una soglia (80%, 100%) che prima del movimento non era passata, mostra un avviso.
6. **Salvadanaio**: saldo = saldo iniziale + quote mensili accumulate − spese con quella `c`. Mai sotto zero: una spesa che supera il saldo chiede quale altra busta copre la differenza.
7. **Quota di una voce**: `importo ÷ mesi mancanti alla data`; dopo il pagamento si ricalcola sul nuovo ciclo (per esempio ogni 24 mesi). Una voce può avere una quota che cambia a una data.
8. **Quota del Joint**: vale quella con `da` più recente non successiva alla data del movimento. Si salva in `q` e non si ricalcola sui movimenti passati.
9. **Credito**: `u − p` di una spesa divisa. Resta aperto finché un rimborso (`t: rb`, `r: id`) lo chiude. Non entra in budget né spendibile.
10. **Entrata per categoria** (R3, sostituisce l'entrata extra): solo un'entrata in una categoria con `finanzia` (lo stipendio) è del mese (`meseCalc.stipendio`, informativo: lo spendibile resta la somma dei residui). Un'entrata in qualsiasi altra categoria di entrata non tocca il mese, non entra in `meseCalc`, spendibile o piano; alla registrazione propone una destinazione (categoria Vendita carte o etichetta TCG → fondo TCG; sotto una soglia → cuscinetto; sopra → fondo emergenze se toccato, salvadanai in ammanco, livello 3-5 anni, cuscinetto). L'utente decide e salva `b`; il saldo del salvadanaio con quel nome cresce.
11. **Patrimonio** = saldi di tutti i conti, con il Joint alla mia quota, più il valore degli investimenti (`valoreInvestimenti`: l'ultimo valore inserito, non il versato; il versato finché non c'è un valore) e il magazzino TCG. I sottosaldi non si sommano ai conti: sono già dentro il saldo del loro conto. Nei conti non entra mai il versamento della compagna come mio.
12. **Posso permettermelo?**: data una spesa ipotetica e una categoria, dice se il residuo basta. Se no, elenca le buste da cui prendere, in ordine di `taglio` (prima le non necessarie con numero più basso).
13. **Chiusura del mese** (3.3): per ogni budget con avanzo o sforo (categorie con budget, mai i salvadanai) chiede una scelta, mai automatica; la pagina la propone e l'utente la cambia. Avanzo → cuscinetto (`cfg.extra.cuscinetto`) o altro salvadanaio, oppure resta sul conto come risparmio. Sforo → prima il cuscinetto se ha abbastanza, poi la prima busta con `taglio` il cui avanzo basta (ordine di `taglio`, come "posso permettermelo?"), altrimenti resta scoperto e la pagina lo segnala. Una sola fonte per sforo; se non basta il resto è scoperto. Un salvadanaio non scende mai sotto zero (la fonte dà al massimo il suo saldo a fine mese). Il fondo emergenze non è fonte né destinazione (non è per gli sforamenti; un giroconto per rimetterci soldi). Un mese si può chiudere solo a mese finito.
14. **Tasso di risparmio** = (PAC + cuscinetto + viaggi di coppia) / stipendio. I salvadanai di spese programmate non contano.
15. **Fondo emergenze**: mesi coperti = saldo ÷ necessarie mensili. Ogni uso richiede una nota.
16. **Scadenze**: per ogni voce con data, avvisa se alla scadenza il saldo previsto non basta.

## Schermate

Stesse funzioni su telefono e PC. Sul telefono, un solo flusso veloce per registrare.

- **Home:** spendibile e patrimonio sempre in alto; elenco delle categorie con speso, residuo e percentuale; pulsante grande "Nuovo movimento".
- **Nuovo movimento** (priorità 1): importo, categoria, conto, nota, etichette; scelta "spesa / entrata / giroconto / versamento compagna / credito". L'entrata sceglie tra le categorie di entrata; se non finanzia il mese compare la destinazione. Sul Joint: quota automatica. Spesa divisa: la mia parte e il credito. Avviso soglie dopo il salvataggio.
- **Elenco movimenti:** filtri per mese, categoria, conto, etichetta; ricerca nella nota; modifica ed eliminazione.
- **Piano del mese** (priorità 2): stipendio, divisione tra budget e salvadanai, quanto resta da assegnare.
- **Salvadanai:** saldo, quota, voci, scadenze, previsione di copertura.
- **Posso permettermelo?** (priorità 2).
- **Sottosaldi e investimenti** (3.2, pagina `#conti`): sotto il saldo di un conto con sottosaldi, il saldo di ognuno e il non assegnato; riquadro Investimenti con versato, valore, differenza e il campo per aggiornare il valore con la data. Il modulo movimento chiede il sottosaldo quando il conto ne ha.
- **Controllo saldi** (3.1, pagina `#conti`): per ogni conto aperto, saldo dello strumento a oggi accanto a un campo per il saldo della banca (anche negativo o zero) e la differenza; sul Joint è il saldo intero del conto, non la mia quota. Storico degli ultimi 5 controlli, avviso in home se manca quello della settimana.
- **Chiusura del mese** (3.3, pagina `#chiusura`): mese (di default il precedente), avanzi e sfori con la scelta proposta e modificabile, riepilogo di ciò che verrà scritto, "Chiudi il mese"; mese chiuso = sola lettura con "Riapri". Promemoria in home se il mese prima ha movimenti e non è chiuso. Sotto il riepilogo: **Per gruppo** (budget del piano, speso, residuo, % sullo stipendio contro % del piano) e **Tasso di risparmio** (3.4).
- **Patrimonio** (3.4, pagina `#patrimonio`): patrimonio oggi con i componenti, campo per il magazzino TCG con data, andamento a fine mese (grafico e tabella; parziale dove manca il saldo iniziale di un conto). In home sotto lo spendibile.
- **Configurazione:** categorie, gruppi, etichette, conti, quota del Joint, soglie, obiettivi, salvadanai e voci.
- **Revisione dei conti:** schermata con i numeri veri e un campo per registrare le decisioni.
- **TCG:** saldo dell'etichetta, fondo e magazzino.

## Migrazione del 2026 dal foglio

Script ripetibile (nello stesso stile dell'import attuale, file locale in `dati/`, mai nel repository):

1. Cancella i movimenti dei mesi 2026 e la configurazione precedente (dati di prova inclusi).
2. Mappa le categorie del foglio:
   - Spesa casa e Spesa cibo → Spesa cibo e casa; Hobby, Eventi, Shopping, Vestiti → Shopping & Svago, con il nome vecchio come etichetta; Parrucchiere e Spesa self care → Self care; Medicine e Visite salute → Salute; Manutenzione Auto, Parcheggi, Multe → Auto variabili, con etichetta; Assicurazione auto e Bollo auto → Auto fissi, come voci; Animali resta Animali; Bollette resta Bollette.
   - Compravendita, Tornei TCG, Judge, Judge Venezia, Judge Lucca, Torneo Londra, OP17 Anniversary, Viaggio Barcellona → TCG, con il nome vecchio come etichetta.
   - Stipendio → entrata nella categoria Stipendio (`finanzia`). Rimborso assicurazione, Referral Revolut, Rimborso papa auto → entrata in Rimborsi (o Altro), non stipendio. Compravendita incassi → entrata in Vendita carte. Le categorie di entrata (Stipendio, Tredicesima, Rimborsi, Vendita carte, Altro) esistono già nella configurazione iniziale (R3).
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
