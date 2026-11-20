# MARK — E-commerce con configuratore grafico

E-commerce a marchio MARK (Zuccheri e dolcificanti dal 1987) per vendere bustine di zucchero personalizzate, bicchieri, portatovaglioli e portabustine. Il cuore del progetto è il **configuratore grafico proprietario**: il cliente crea da solo la grafica, la vede come verrà prodotta, conosce il prezzo totale e paga subito.

**SCEGLI → PERSONALIZZA → VISUALIZZA → CONFERMA → PAGA → RICEVI**

- Nessuna dipendenza npm: server Node.js 22+ e database SQLite integrato (`node:sqlite`).
- Nessun configuratore esterno: editor, QR code, mockup ed esportazioni sono codice di questo repository.

## Avvio

```bash
npm start          # http://localhost:3000
npm test           # test di integrazione (listini, ordini, provvigioni)
```

### Su Replit
1. *Import from GitHub* → `promoapp360-prog/mark`. Il file `.replit` è già pronto (Node 22, `npm start`).
2. Nei **Secrets** imposta almeno `ADMIN_PASSWORD`. Per i pagamenti online aggiungi le chiavi indicate in `.env.example`.
3. Per la pubblicazione usa una **Reserved VM** (già impostata in `.replit`). Il database e i file delle grafiche stanno in `DATA_DIR` (default `./data`). Un deployment *Autoscale* ha un disco non persistente e perderebbe ordini e grafiche a ogni ripubblicazione.
4. Gestionale: `/admin` (password = `ADMIN_PASSWORD`; senza Secret la password provvisoria è `cambiami`, segnalata in dashboard).

## Primi passi nel gestionale (obbligatori prima di vendere)
La dashboard segnala ogni punto aperto.

| Sezione | Cosa fare |
|---|---|
| Spedizioni | Inserire le fasce di peso e i costi. **Finché non sono attive, gli ordini sono bloccati** (nessun costo inventato). |
| Pagamenti | IBAN per il bonifico, supplemento contrassegno, attivazione di Stripe e PayPal. |
| Partner e provvigioni | Percentuali concordate per primo ordine e riordini, durata dei riordini in mesi, base con o senza impianto. |
| Prodotti | Peso per unità (per la spedizione) e misure reali dell'area di stampa di bicchieri, portatovaglioli e portabustine (oggi marcate "da verificare"). |
| Colori di stampa | Verificare i Pantone disponibili e i relativi colori a video. |

## Catalogo caricato (Catalogo MARK 2026, IVA esclusa)
- **Bustine Extrafine**, cartone da 10 kg (circa 1.818 bustine da 5,5 g):
  - 1 colore: 5 / 10 / 50 cartoni a € 22 / 20 / 18
  - 2-4 colori: da 60 cartoni a € 18,50
- **Bustine di canna**, cartone da 5 kg: 1 colore, 5 / 30 cartoni a € 13 / 11
- **Impianto stampa**: € 50 per grafica. Sui riordini della stessa grafica non si paga; si può cambiare nelle Impostazioni.
- **Bicchieri 75, 90 e 240 cc**, confezioni da 50 pezzi, con le fasce del listino. **Coperchi** a € 25, 30 e 35 ogni 1.000 pezzi.
- **Portatovaglioli 17×17**: 4 modelli, stampa digitale su 2 lati, terzo lato +10%.
- **Portabustine**: 6 modelli, stampa digitale su 2 lati.
- **Neutri**: zucchero extrafine 2,5 kg a € 3,75, muscovado 1 kg a € 8,00.

Bustina: **70×45 mm**, fronte e retro, margine di sicurezza 4 mm, saldatura 3 mm. Le diciture fisse della bozza ufficiale sono bloccate: "Zucchero" e "Confezionato da MARK & Co Srl - ☎ 081 528.53.14" sul fronte, "Non vendibile singolarmente" sul retro. Si modificano dal profilo prodotto (`fixedObjects`).

## Architettura

```
src/
  server.js     API pubbliche, area clienti, gestionale, file statici
  db.js         schema SQLite
  seed.js       catalogo 2026, font, 20 template, impostazioni iniziali
  pricing.js    motore prezzi unico (preventivo = carrello = ordine)
  payments.js   Stripe Checkout e PayPal Orders v2 via REST (senza SDK)
public/
  editor.html + js/editor.js   configuratore
  js/render.js                 rendering, mockup, controlli qualità, export PNG/SVG
  js/qr.js                     generatore QR code (ISO 18004) interno
  js/icons.js                  decorazioni vettoriali + emoji ricercabili
  index.html, carrello.html, ordine.html, account.html
  admin/                       gestionale
test/api.test.js
```

### Il configuratore
- **Coordinate in millimetri reali** del prodotto. Ogni elemento (testo, immagine, icona, emoji, QR, forma) ha centro, dimensione e rotazione.
- **Profilo tecnico per prodotto**, che si modifica da *Prodotti → profilo tecnico*. Contiene: misure, margine di sicurezza, saldatura, lati (anche facoltativi), dimensione minima del testo, dpi minimi, colore del supporto, forma del mockup (`sachet` | `cup` | `box`) e diciture fisse.
  - **Un nuovo prodotto personalizzabile si aggiunge dal gestionale, senza toccare l'editor.**
- **Modalità colore** in base al tipo di stampa:
  - `mono`: 1 Pantone, tutto viene stampato in quel colore e loghi e foto diventano monocromatici con una soglia regolabile
  - `multi`: massimo N Pantone dalla palette
  - `full`: stampa digitale a colori
- **Funzioni**:
  - modelli
  - font Google con licenza OFL, divisi in categorie e con anteprima nel carattere
  - caricamento di logo e foto con rimozione dello sfondo bianco
  - decorazioni vettoriali, emoji e simboli
  - QR vettoriale
  - livelli, blocco e visibilità degli elementi
  - annulla e ripristina
  - duplicazione dell'elemento o del progetto, copia sull'altro lato
  - aggancio al centro
  - zoom, pan, pinch e rotazione con due dita
  - salvataggio automatico locale e progetto salvato su server con link per riprenderlo
- **Viste**: modifica, mockup realistico, confronto tra prodotto neutro e personalizzato, vista tecnica quotata.
- **Controlli qualità** in `render.js → checkDesign`:
  - **bloccanti**: elementi fuori dal bordo, testo sotto il minimo, immagini sotto i dpi minimi, QR non leggibile, colori oltre il limite o fuori palette, elementi che coprono le diciture obbligatorie, grafica vuota
  - **avvisi**: margine di sicurezza, testo piccolo, risoluzione bassa, sovrapposizioni, conversione a 1 colore
- **Conferma obbligatoria** con la frase richiesta. Al momento della conferma il browser genera per ogni lato:
  - PNG di produzione a 600 dpi (300 dpi per i formati grandi), con sfondo trasparente
  - SVG vettoriale in millimetri
  - anteprima piatta
  - mockup

  Il server salva la grafica come **immutabile** insieme al profilo tecnico del momento: se in seguito cambiano template o regole di stampa, le grafiche confermate restano invariate.

### Ordini e produzione
- I prezzi vengono sempre ricalcolati dal server con il listino; il client non decide mai un prezzo.
- Nell'ordine si salvano le righe con i prezzi, i totali e i riferimenti alle grafiche.
- **Stati del pagamento**: in attesa, pagato, rimborsato, annullato.
- **Stati della produzione**: grafica da verificare, in produzione, spedito, consegnato, annullato. La produzione può partire solo dopo che tutte le grafiche dell'ordine sono state approvate.
- Dal gestionale si scaricano i PNG di produzione, gli SVG, i mockup e il JSON del progetto.

### Pagamenti
- **Bonifico anticipato**: le coordinate sono mostrate al cliente con la causale; l'ordine si segna come pagato dal gestionale.
- **Contrassegno**: supplemento fisso e/o percentuale e importo massimo, configurabili.
- **Stripe** (`STRIPE_SECRET_KEY`): Checkout ospitato. Il pagamento si conferma sia al ritorno del cliente sia tramite il webhook firmato `/api/webhooks/stripe` (evento `checkout.session.completed`, richiede `STRIPE_WEBHOOK_SECRET`).
- **PayPal** (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox|live`): ordine e cattura del pagamento al ritorno.
- Un metodo attivo ma senza chiavi **non viene mostrato** al cliente.
- Se il server è dietro un dominio personalizzato, imposta `PUBLIC_URL` per gli URL di ritorno.

### Provvigioni
- Tutti gli incassi sono di MARK. Il cliente viene associato a un partner tramite il link `/r/CODICE` (oppure `?ref=CODICE`) o, in mancanza, al partner predefinito; dal gestionale si può riassegnare.
- **Base di calcolo**: imponibile della merce, con o senza impianto.
- **Percentuali**: una per il primo ordine e una per i riordini, con una finestra opzionale in mesi.
- **Stati**: in attesa di pagamento → maturata → da liquidare → liquidata, più "rettificata" con importo e nota. Annullamenti e rimborsi rettificano a 0 in automatico.
- Esportazione in CSV.

### Area clienti
Accesso con email e password (account creato al checkout o con la registrazione). Il cliente vede gli ordini con il loro stato e il tracking e i progetti salvati. Può **riordinare** la stessa grafica, senza pagare di nuovo l'impianto, oppure **modificarla e riordinarla**: in questo caso viene creata una nuova grafica.

## Cose da completare o verificare
- **Misure dell'area di stampa** di bicchieri, portatovaglioli e portabustine (oggi provvisorie e segnalate al cliente) e **pesi** per la spedizione.
- **Email transazionali**, cioè conferma d'ordine e cambi di stato: oggi il cliente segue tutto dalla pagina dell'ordine e dall'area clienti. Va collegato un servizio SMTP o un provider email.
- **Testi legali**: condizioni di vendita, privacy, cookie.
- **Immagini di prodotto reali** da caricare per i prodotti neutri.
- **Tracciamento advertising** (Meta Pixel, Google Ads) e SEO avanzato: punto 9 delle priorità.
