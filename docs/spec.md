# Specifica — Conto Spese 2027

Fonti: `docs/visione.md`, `docs/strategia-2027.md` (privati, con le cifre). Vocabolario: `CONTEXT.md`. Questo file non contiene cifre personali: i numeri da configurare stanno nella strategia.

## Decisioni di impianto

- Si evolve il progetto esistente: pagina statica, login Google, Firestore con cache offline, `logic.js` pura con test.
- Il nuovo modello sostituisce il vecchio nelle stesse collezioni. Nessun backup di Firestore finché i dati sono di prova; dopo l'avvio da zero si fa un backup prima di cambiare il formato.
- **Nessuna migrazione dal foglio** (decisione del 26/11/2026): a gennaio 2027 si parte da zero, senza storico. Vedi "Avvio senza storico". Il giorno lo decide l'utente (al più tardi il 31 dicembre).
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

Regole: un movimento sul Joint ha `u` intero e `p = u × q`. Una spesa divisa con altri ha `p` e crea un credito aperto per `u − p`. Un versamento della compagna (`vj`) conta solo nel saldo del Joint.

### `spese_config/main`

- `categorie`: lista di `{nome, gruppo, budget, joint, taglio, archiviata, entrata?, finanzia?}`. `entrata: true` = **categoria di entrata** (Stipendio, Tredicesima, Rimborsi, Vendita carte, Altro): non ha budget, gruppo né `taglio` (la validazione lo rifiuta), non compare tra le categorie di spesa e un movimento di entrata ne sceglie una. `finanzia: true` (solo su una categoria di entrata, di norma Stipendio) = un'entrata in questa categoria finanzia il mese; le altre non toccano il mese e propongono una destinazione. `budget` è **mensile** (oggi il campo `budget` è annuale e sparisce). `joint` = il budget della categoria è sul conto Joint (già la mia quota): serve al "di cui Joint" del piano del mese (`piano(...).joint`); si imposta dalla pagina Categorie (colonna Joint e modulo, solo categorie di spesa), nessun altro effetto sui calcoli. `taglio` = priorità di taglio (solo non necessarie).
  - `taglio` è un intero positivo **unico** tra le categorie non archiviate; vuoto = fuori classifica. Un numero già usato sposta in giù di uno la catena sotto; togliere il numero non rinumera (i buchi restano). Le archiviate non partecipano (`riordinaTaglio` in `logic.js`).
- `salvadanai`: lista di `{nome, gruppo, conto, voci: [{nome, annuale, data, cicli?, cambio?}], quota?, saldoIniziale: {data, importo}, obiettivo?, sottoZero?}`. `sottoZero: true` (R5, il Fondo TCG): il saldo può scendere sotto zero, la regola 6 non vale e un saldo negativo è "da recuperare" con le prossime vendite di carte. `obiettivo` (opzionale, euro): per un salvadanaio senza voci è la cifra annuale da cui si ricava il piano; per il fondo emergenze è la soglia sotto cui è "toccato". **In ammanco** (R7) = il saldo è sotto quanto il piano ha già maturato: con voci, la somma delle quote di ogni voce dall'inizio del suo ciclo al mese corrente (0 per una voce già pagata nel ciclo, cioè con una spesa `v` = suo nome); senza voci, `obiettivo × mese dell'anno ÷ 12`; il fondo emergenze (nome `cfg.extra.emergenze`) l'intero obiettivo; un salvadanaio `sottoZero` è escluso. Ammanco = `max(0, maturato − saldo)`; la pagina Salvadanai lo mostra («manca X rispetto al piano») e il suggerimento delle entrate extra sceglie quello più alto. Il saldo include le entrate extra con `b` = nome del salvadanaio. La quota mensile è la somma delle voci o, senza voci, il valore fisso `quota`. Voce: `data` = mese di scadenza `YYYY-MM`; `cicli` = mesi del ciclo (assente = 12); `cambio` = `{da: 'YYYY-MM', quota}`: dal mese `da` la quota della voce è quel valore fisso, al posto di quella calcolata. Il saldo resta uno solo: `v` sul movimento è solo un'etichetta.
- `conti`: lista di `{nome, joint, chiuso, saldoIniziale?}`. `saldoIniziale = {data, importo}` (importo anche negativo o 0): il saldo del conto nello strumento parte da lì e conta solo i movimenti dalla `data` in poi (`saldi(mesi, cfg, finoA)`). `joint` = conto comune: le spese su di esso hanno `u` intero con `p` e `q` calcolati dalla quota, e solo su di esso va il versamento della compagna. Un conto chiuso resta nei saldi storici e non accetta movimenti nuovi. **Trade Republic (R6)**: due conti normali, "TradeRepublic Fondo" (fondo emergenze) e "TradeRepublic Investimenti" (investimenti livello 3-5 anni), ognuno con il proprio saldo iniziale e il proprio controllo saldi. Un trasferimento tra i due è un giroconto normale. Non esistono sottosaldi né il campo `ss`: un `ss` o `sottosaldi` rimasti nei dati salvati sono ignorati. Nessun conto per il deposito Revolut: resta nel saldo Revolut.
- `controlli`: lista di `{d, k, banca, strumento, diff}`, un controllo dei saldi (3.1): data, conto, saldo letto nell'app della banca, saldo dello strumento in quel momento e `diff = banca − strumento`. Un solo campo di `spese_config/main` (lista intera, come `piani`); un nuovo controllo dello stesso conto nello stesso giorno sostituisce il precedente. Non crea mai movimenti di correzione. Il controllo è in ritardo se l'ultimo ha più di 7 giorni o non c'è; i conti chiusi non si controllano.
- `quotaJoint`: lista di `{da, pct}`; vale quella con `da` più recente non successiva alla data del movimento.
- `soglie`: `[80, 100]`.
- `etichette`: lista di `{nome, categoria?}`, solo suggerimenti per il campo Etichette (la categoria o il salvadanaio a cui appartengono; senza `categoria` = trasversale, come TCG). Le etichette dei movimenti restano in `l` e compaiono comunque.
- `obiettivi`: lista di `{nome, attuale, desiderato}` (investimenti, rata auto). Nessuna regola automatica.
- `extra`: opzionale, `{soglia: 100, cuscinetto, emergenze, investimenti, tcg}`: soglia e nomi usati dal suggerimento delle entrate extra (default: 100, "Cuscinetto", "Fondo emergenze", "Investimenti", "Fondo TCG").
- `fondoEmergenze`: `{conto, obiettivo}`. `conto` = il conto che tiene il fondo (R6: "TradeRepublic Fondo"); il saldo del fondo è il saldo di quel conto (saldo iniziale e movimenti, come per ogni conto). `obiettivo` in euro. Un vecchio `sottosaldo` è ignorato.
- `investimenti`: `{conto, valore: [{d, importo}]}` (3.2, R6). `conto` = il conto investimenti ("TradeRepublic Investimenti"). `versato` non si salva: è il saldo iniziale del conto più i giroconti in entrata, meno quelli in uscita, dalla data del saldo iniziale (una commissione o un interesse sul conto non sono "versato"). `valore` = valori inseriti a mano con la data; vale l'ultimo. Differenza = valore − versato (plusvalenza o minusvalenza). Il PAC si registra come giroconto verso il conto investimenti.
- ~~`magazzinoTCG`~~: rimosso in R5 (il valore delle carte in magazzino non si tiene più). Un campo rimasto in una configurazione salvata viene ignorato.
- `risparmioMin`: minimo del tasso di risparmio in percentuale (default 10), solo da import. Nomi dei salvadanai del tasso: `extra.cuscinetto` e `extra.viaggi` (default Cuscinetto, Viaggi di coppia).
- `piani`: mappa `{<YYYY-MM>: {stipendio, righe: [{nome, importo}]}}`, un campo di `spese_config/main`: stipendio del mese e importo assegnato a ogni budget e salvadanaio. Le righe sono un elenco (non una mappa) perché i nomi possono contenere caratteri vietati nelle chiavi, e un salvataggio le sostituisce tutte. Un mese senza piano parte dall'ultimo piano precedente, altrimenti da budget e quote correnti. Il piano non cambia budget né quote: li registra per quel mese. Il giroconto al Joint non è una riga (solo "di cui Joint", informativo).
- `chiusure`: mappa `{<YYYY-MM>: {d, righe: [{c, tipo, importo, a, coperto}]}}`, un campo di `spese_config/main` (come `piani` e `controlli`, non un documento a parte). Una chiusura del mese (3.3): `d` = data in cui è stata fatta; ogni riga è una categoria di spesa con avanzo (`tipo: 'avanzo'`) o sforo (`'sforo'`), `importo` = differenza assoluta, `a` = scelta ('' = avanzo che resta sul conto come risparmio, sforo non coperto). Avanzo: `a` è un salvadanaio e gli va `importo − coperto`; `coperto` = quanto di quell'avanzo ha coperto altri sfori. Sforo: `a` è un salvadanaio (gli si toglie `coperto`) o una busta con `taglio` e avanzo nello stesso mese (il suo avanzo cala di `coperto`); `importo − coperto` = scoperto. Non scrive movimenti: il saldo di un salvadanaio legge le righe (`saldoSalvadanaio(mesi, sv, ym, chiusure)`) dal mese della chiusura in poi. Un mese si chiude una volta; si riapre (cancella la chiusura) solo finché il mese dopo non è chiuso.
- `revisioni`: data e decisioni di ogni revisione dei conti.

I vecchi campi `gruppi`, `colori` e `budget` annuale vengono ignorati.

## Categorie, etichette, conti

- 17 categorie con budget (strategia A1), più: **Animali** (al posto di Gatta Evie), **Bollette** (al posto di Bollette luce), **Investimenti**, **TCG** (senza budget) e, per decisione dell'utente del 26/11/2026 (R5, unica eccezione alla regola "nessuna categoria nuova"), **Abbonamenti Condivisi** (Joint, gruppo Non necessarie, fuori classifica): Abbonamenti resta personale e Netflix e fibra vanno nella nuova, così il "di cui Joint" del piano torna al giroconto della strategia. Gruppo = proprietà di ogni voce.
- Etichette dentro le categorie e l'ambito trasversale **TCG** (strategia A2).
- Categorie archiviate (solo mesi passati, senza budget, nascoste per movimenti nuovi): Viaggio Jap, Vacanze, Trasloco, Tatuaggio Lione, Documenti, Check Money, Offerte cucci.
- Conti: Revolut, Revolut Joint, Paypal, Contanti, Buoni, TradeRepublic, e **Padel (chiuso a luglio)**: resta con i suoi movimenti, mai spostati su Revolut.
- Trade Republic ha due conti separati (fondo emergenze e investimenti), non sottosaldi (R6). Nessun conto per il deposito Revolut: resta nel saldo Revolut.
- Salvadanai: tutti sul Revolut, tranne Viaggi di coppia (Joint) e fondo emergenze e investimenti (Trade Republic).

## Regole di calcolo (tutte in `logic.js`, con test)

1. **La mia parte** di un movimento: `p` se presente, altrimenti `u` (e `e` per le entrate). I giroconti, i versamenti della compagna e i crediti aperti non sono mie spese.
2. **Speso di una categoria nel mese** = somma delle mie parti delle **spese** con quella `c` nel mese. Nessun riporto. Un'entrata non riduce mai lo speso, qualunque sia la sua categoria.
3. **Residuo del budget** = budget − speso. **Percentuale usata** = speso / budget, solo di questo mese.
4. **Spendibile** = somma dei residui dei budget del mese (Joint alla mia quota). Esclude salvadanai e fondo emergenze. Non dipende dai saldi dei conti.
5. **Avvisi**: dopo ogni salvataggio, se la percentuale usata di una categoria passa una soglia (80%, 100%) che prima del movimento non era passata, mostra un avviso.
6. **Salvadanaio**: saldo = saldo iniziale + quote mensili accumulate − spese con quella `c`. Mai sotto zero: una spesa che supera il saldo chiede quale altra busta copre la differenza. Eccezione (R5): un salvadanaio con `sottoZero` (il Fondo TCG) può andare sotto zero; il saldo negativo si mostra come "da recuperare" e il suggerimento delle vendite di carte dice quanto manca per tornare a zero.
7. **Quota di una voce**: `importo ÷ mesi mancanti alla data`; dopo il pagamento si ricalcola sul nuovo ciclo (per esempio ogni 24 mesi). Una voce può avere una quota che cambia a una data.
8. **Quota del Joint**: vale quella con `da` più recente non successiva alla data del movimento. Si salva in `q` e non si ricalcola sui movimenti passati.
9. **Credito**: `u − p` di una spesa divisa, oppure un prestito (`t: cr`, importo `u`). Una spesa divisa si chiude con un rimborso (`t: rb`, `r: id`). Un prestito si chiude quando la somma dei suoi rimborsi arriva all'importo: i rimborsi parziali sono ammessi e un rimborso che supera il residuo è rifiutato. **Credito iniziale** = prestito senza conto (`k` vuoto): non muove nessun saldo di conto. I crediti aperti si vedono nella pagina Patrimonio con importo iniziale, rimborsato e residuo, fuori dal totale. Non entrano in budget né spendibile.
10. **Entrata per categoria** (R3, sostituisce l'entrata extra): solo un'entrata in una categoria con `finanzia` (lo stipendio) è del mese (`meseCalc.stipendio`, informativo: lo spendibile resta la somma dei residui). Un'entrata in qualsiasi altra categoria di entrata non tocca il mese, non entra in `meseCalc`, spendibile o piano; alla registrazione propone una destinazione (categoria Vendita carte o etichetta TCG → fondo TCG; sotto una soglia → cuscinetto; sopra → fondo emergenze se toccato, salvadanai in ammanco rispetto al piano (R7), livello 3-5 anni, cuscinetto). L'utente decide e salva `b`; il saldo del salvadanaio con quel nome cresce.
11. **Patrimonio** = saldi di tutti i conti, con il Joint alla mia quota, dove il conto investimenti conta per il suo ultimo valore inserito al posto del saldo contabile (il saldo finché non c'è un valore; una sola riga, nessun doppio conteggio). Il fondo emergenze è un conto come gli altri. Nei conti non entra mai il versamento della compagna come mio.
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
- **Investimenti** (3.2, R6, pagina `#conti`): riquadro Investimenti con versato, valore, differenza e il campo per aggiornare il valore con la data. I due conti Trade Republic compaiono come righe normali, ognuna con il proprio controllo saldi.
- **Controllo saldi** (3.1, pagina `#conti`): per ogni conto aperto, saldo dello strumento a oggi accanto a un campo per il saldo della banca (anche negativo o zero) e la differenza; sul Joint è il saldo intero del conto, non la mia quota. Storico degli ultimi 5 controlli, avviso in home se manca quello della settimana.
- **Chiusura del mese** (3.3, pagina `#chiusura`): mese (di default il precedente), avanzi e sfori con la scelta proposta e modificabile, riepilogo di ciò che verrà scritto, "Chiudi il mese"; mese chiuso = sola lettura con "Riapri". Promemoria in home se il mese prima ha movimenti e non è chiuso. Sotto il riepilogo: **Per gruppo** (budget del piano, speso, residuo, % sullo stipendio contro % del piano) e **Tasso di risparmio** (3.4).
- **Patrimonio** (3.4, pagina `#patrimonio`): patrimonio oggi con i componenti, andamento a fine mese (grafico e tabella; parziale dove manca il saldo iniziale di un conto). In home sotto lo spendibile.
- **Configurazione:** categorie, gruppi, etichette, conti, quota del Joint, soglie, obiettivi, salvadanai e voci.
- **Revisione dei conti** (ogni 3 mesi: fine marzo, fine giugno, fine settembre, fine dicembre): schermata con i numeri veri e un campo per registrare le decisioni.
- **TCG:** saldo dell'etichetta (somma di entrate meno uscite dei movimenti con l'etichetta TCG, senza valore di magazzino) e fondo TCG.

## Avvio senza storico

A gennaio 2027 si parte da zero: il 2026 non si importa e il foglio "Budgeting 26" resta in sola lettura come archivio. Nel giorno scelto dall'utente (al più tardi il 31 dicembre 2026):

1. **Azzera i dati di prova** (Configurazione → Dati): cancella i movimenti di tutti i mesi e, con le caselle attive di default, i controlli dei saldi, le chiusure e i piani del mese. Mostra quanti mesi e movimenti spariscono e chiede di scrivere AZZERA. Non tocca mai categorie, conti, salvadanai, quota Joint, soglie, obiettivi, voci, fondo emergenze né investimenti.
2. **Carica la configurazione** (`dati/config-2027.json`, Configurazione → Dati).
3. **Saldi iniziali al 1/1/2027** di tutti i conti, dai saldi veri delle app della banca (compresi TradeRepublic Fondo e TradeRepublic Investimenti); il valore degli investimenti nella pagina Conti.
4. **Un solo credito iniziale**: il credito residuo verso la compagna, senza dettaglio per spesa, come credito senza conto con l'importo del giorno.
5. **Primo controllo saldi** nella pagina Conti: banca e strumento devono coincidere.

I dati veri non vanno mai nel repository e non vanno stampati.

## Fuori specifica (per ora)

- Spese ricorrenti automatiche (extra, da verificare prima di registrarle).
- Cambi di categoria (rinomina, unione, eliminazione con scelta sui movimenti passati): ultima attività.
- Livello d'investimento a 20 anni: non deciso.
