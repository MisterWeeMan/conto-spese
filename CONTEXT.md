# CONTEXT — vocabolario del dominio

Termini dello strumento, in italiano. Gli stessi nomi vanno usati nel codice e nella UI. Fonte: `docs/visione.md` e `docs/strategia-2027.md`.

## Soldi del mese

- **Stipendio**: entrata base mensile (arriva tra il 5 e il 10). Viene diviso tutto tra budget e salvadanai.
- **Budget mensile**: limite di spesa di una categoria per un mese. Si azzera ogni mese, nessun riporto. La percentuale dice solo quanto è usato di questo mese.
- **Categoria**: voce di spesa con budget (15-20 in tutto). Il dettaglio fine va nelle etichette.
- **Gruppo**: necessarie, non necessarie, risparmi e salvadanai (circa 50/30/20). È una proprietà di ogni categoria o salvadanaio, non un contenitore fisso.
- **Busta**: nome generico per budget o salvadanaio. Una spesa può essere coperta prendendo da un'altra busta.
- **Priorità di taglio**: numero su ogni busta non necessaria (1 = prima da tagliare). Ordina i suggerimenti di "posso permettermelo?". Il numero è unico tra le categorie attive: se ne dai uno già usato, le altre da lì in giù scalano di uno.
- **Cuscinetto**: busta di risparmio che copre gli sforamenti dei budget.
- **Piano del mese**: la divisione dello stipendio tra budget e salvadanai.
- **Chiusura del mese**: scelta esplicita su avanzi e sfori. Dove va l'avanzo, chi copre lo sforo.
- **Spendibile**: quanto posso spendere questo mese, fuori da salvadanai e fondo emergenze.
- **Soglia**: percentuale del budget usato (80%, 100%) che fa scattare un avviso dopo il salvataggio.

## Salvadanai

- **Salvadanaio**: riceve una quota mensile e accumula. Non va mai sotto zero (eccezione: il Fondo TCG, che può scendere sotto zero: soldi da recuperare con le prossime vendite di carte). Vive in un conto, anche nel Joint.
- **Voce** (di un salvadanaio): importo annuale con data (assicurazione, bollo...). La quota mensile è la somma delle voci; il saldo è uno solo.
- **Quota mensile**: quanto entra ogni mese. Si calcola da obiettivo e data, e può cambiare a una data programmata.
- **Saldo iniziale**: saldo di partenza a una data (al 1/1/2027, dai saldi veri delle app della banca).
- **Avvio senza storico**: a gennaio 2027 si parte da zero, senza importare il 2026; il foglio resta in sola lettura come archivio.
- **Fondo emergenze**: obiettivo fisso, su Trade Republic. Conta nel patrimonio, non nello spendibile. Ogni uso richiede una nota.
- **Fondo TCG**: salvadanaio alimentato solo dalle entrate con etichetta TCG o nella categoria Vendita carte.
- **Revisione dei conti**: controllo programmato (fine marzo 2027, poi ogni 3 mesi: fine giugno, fine settembre, fine dicembre) con numeri veri. Registra cosa ho deciso.
- **Obiettivo di quota**: aumento desiderato (per esempio investimenti e rata auto). Non è una regola automatica.

## Conti e movimenti

- **Conto**: dove stanno i soldi davvero (Revolut, Joint, PayPal, contanti, buoni, Trade Republic). Saldi controllati ogni settimana, riconciliati ogni mese.
- **Conti Trade Republic**: due conti normali, "TradeRepublic Fondo" (fondo emergenze) e "TradeRepublic Investimenti" (investimenti livello 3-5 anni). Un trasferimento tra i due è un giroconto.
- **Movimento**: una riga del registro. Ha sempre una nota libera.
- **Giroconto**: spostamento tra conti, una riga sola, da → a. Fuori da ogni totale.
- **Categoria di entrata**: categoria per le entrate (Stipendio, Tredicesima, Rimborsi, Vendita carte, Altro). Non ha budget né priorità di taglio. Un'entrata non riduce mai lo speso di una categoria di spesa.
- **Stipendio che finanzia il mese**: l'unica categoria di entrata con il flag "finanzia il mese". Un'entrata in qualsiasi altra categoria di entrata (l'ex **entrata extra**: tredicesima, rimborsi, vendita carte) non tocca il mese: quando arriva, decido dove va.
- **Credito**: soldi che qualcuno mi deve. Non è una mia spesa. Una spesa divisa si chiude con un rimborso; un prestito si chiude quando i rimborsi (anche a rate) arrivano all'importo.
- **Credito iniziale**: il credito residuo al giorno del passaggio, registrato come credito senza conto (non muove nessun saldo) con importo, data e nota. Non è patrimonio.
- **Etichetta**: dettaglio dentro una categoria o ambito trasversale (TCG). Mostra quanto pesa; nessun budget proprio.
- **Saldo dell'etichetta**: entrate meno uscite dei movimenti con quell'etichetta in un periodo (per TCG: quanto guadagno o perdo con le carte). Informazione, non budget: non entra nello spendibile né nel piano. Non è il saldo del **Fondo TCG**, che è un salvadanaio.

## Joint

- **Joint**: conto comune con la compagna.
- **Quota del Joint**: la mia parte delle spese comuni (configurabile). Ogni valore vale da una data in poi; i movimenti passati non cambiano.
- **Versamento della compagna**: registrato solo per far tornare il saldo del Joint. Non è mia entrata e non entra in totali, budget, spendibile o patrimonio.

## Numeri sempre visibili

- **Patrimonio**: tutto quello che ho, per vedere la crescita. Del Joint conta solo la mia quota.
- **Valore e versato** (investimenti): versato = soldi messi; valore = valore attuale, aggiornato a mano.
- **Tasso di risparmio**: quota dello stipendio che va in PAC, cuscinetto e viaggi di coppia, contro il minimo indicato dalla guida.

## Aggiunte decise nella chat di unione

- **Spendibile** = somma dei residui dei budget del mese (budget meno speso, Joint alla mia quota). Non dipende dai saldi dei conti.
- **Categoria archiviata**: resta nei mesi passati, non ha budget, è nascosta quando registro una spesa nuova.
- **Conto chiuso**: resta nel registro e nei saldi storici, non si può usare per movimenti nuovi.
- **TCG**: categoria senza budget. Le vecchie categorie dei tornei, dei Judge e delle trasferte diventano etichette di TCG.
