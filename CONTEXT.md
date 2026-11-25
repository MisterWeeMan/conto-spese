# CONTEXT — vocabolario del dominio

Termini dello strumento, in italiano. Gli stessi nomi vanno usati nel codice e nella UI. Fonte: `docs/visione.md` e `docs/strategia-2027.md`.

## Soldi del mese

- **Stipendio**: entrata base mensile (arriva tra il 5 e il 10). Viene diviso tutto tra budget e salvadanai.
- **Budget mensile**: limite di spesa di una categoria per un mese. Si azzera ogni mese, nessun riporto. La percentuale dice solo quanto è usato di questo mese.
- **Categoria**: voce di spesa con budget (15-20 in tutto). Il dettaglio fine va nelle etichette.
- **Gruppo**: necessarie, non necessarie, risparmi e salvadanai (circa 50/30/20). È una proprietà di ogni categoria o salvadanaio, non un contenitore fisso.
- **Busta**: nome generico per budget o salvadanaio. Una spesa può essere coperta prendendo da un'altra busta.
- **Priorità di taglio**: numero su ogni busta non necessaria (1 = prima da tagliare). Ordina i suggerimenti di "posso permettermelo?".
- **Cuscinetto**: busta di risparmio che copre gli sforamenti dei budget.
- **Piano del mese**: la divisione dello stipendio tra budget e salvadanai.
- **Chiusura del mese**: scelta esplicita su avanzi e sfori. Dove va l'avanzo, chi copre lo sforo.
- **Spendibile**: quanto posso spendere questo mese, fuori da salvadanai e fondo emergenze.
- **Soglia**: percentuale del budget usato (80%, 100%) che fa scattare un avviso dopo il salvataggio.

## Salvadanai

- **Salvadanaio**: riceve una quota mensile e accumula. Non va mai sotto zero. Vive in un conto, anche nel Joint.
- **Voce** (di un salvadanaio): importo annuale con data (assicurazione, bollo...). La quota mensile è la somma delle voci; il saldo è uno solo.
- **Quota mensile**: quanto entra ogni mese. Si calcola da obiettivo e data, e può cambiare a una data programmata.
- **Saldo iniziale**: saldo di partenza a una data.
- **Fondo emergenze**: obiettivo fisso, su Trade Republic. Conta nel patrimonio, non nello spendibile. Ogni uso richiede una nota.
- **Fondo TCG**: salvadanaio alimentato solo dalle entrate con etichetta TCG (vendite di carte).
- **Revisione dei conti**: controllo programmato (fine marzo 2027, poi ogni 6 mesi) con numeri veri. Registra cosa ho deciso.
- **Obiettivo di quota**: aumento desiderato (per esempio investimenti e rata auto). Non è una regola automatica.

## Conti e movimenti

- **Conto**: dove stanno i soldi davvero (Revolut, Joint, PayPal, contanti, buoni, Trade Republic). Saldi controllati ogni settimana, riconciliati ogni mese.
- **Sottosaldo**: parte di un conto con uno scopo (solo in Trade Republic: fondo emergenze e investimenti).
- **Movimento**: una riga del registro. Ha sempre una nota libera.
- **Giroconto**: spostamento tra conti, una riga sola, da → a. Fuori da ogni totale.
- **Entrata extra**: entrata che non finanzia il mese (tredicesima, rimborsi, vendita carte). Quando arriva, decido dove va.
- **Credito**: soldi che qualcuno mi deve. Non è una mia spesa; si chiude al rimborso.
- **Etichetta**: dettaglio dentro una categoria o ambito trasversale (TCG). Mostra quanto pesa; nessun budget proprio.
- **Magazzino** (TCG): valore delle carte in magazzino, inserito a mano. Entra nel saldo dell'etichetta.

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
