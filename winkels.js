/* Vineder – winkels voor "Zoek in de winkel" op een leeg vak.
   Gewone, onbetaalde zoeklinks: Vineder verdient hier niets aan.
   url: zoekpagina van de winkel, {q} wordt de zoekterm.
   ok:  true = zoeklink is gecontroleerd en werkt. false = nog niet getest: alleen zichtbaar
        met ?winkeltest=1 achter het adres (dan staat er "test" bij het knopje).
   Test een winkel: open vineder.nl/?winkeltest=1, tik een leeg vak, tik de winkel en kijk of er
   zoekresultaten staan. Werkt het? Zet ok op true. Werkt het niet? Pas url aan of haal de winkel weg. */
const SHOPS=[
  {id:'wijnvoordeel',naam:'Wijnvoordeel',url:'https://www.wijnvoordeel.nl/catalogsearch/result/?q={q}',ok:true},
  {id:'gall',naam:'Gall & Gall',url:'https://www.gall.nl/zoeken/?q={q}',ok:true}
  /* Getest en afgevallen (404 of zoekpagina toont niet alleen de zoekterm): vino.com, bovino.nl, degoudenton.nl,
     wijnbeurs.nl, colaris.nl, vindict.nl. Zoek bij hen eerst het echte zoekadres op en test met ?winkeltest=1. */
];

/* Zoekterm voor een vak: het label tot aan " / ", zonder haakjes. Leeg = geen knop.
   Is het label los te vaag ("Brut", "Reserva"; het vak heeft geen appellation of druif maar wel een gebied),
   dan komt de gebiedsnaam ervoor ("Champagne Brut"). gebieden: {code:{naam}}, standaard AREAS uit data.js. */
function zoekterm(sl,gebieden){
  const m=(sl&&sl.m)||{};
  let t=String((sl&&sl.l)||'').split(' / ')[0].replace(/[()]/g,' ').replace(/\s+/g,' ').trim();
  if(!t||/^(overig|overige|andere|alle)\b/i.test(t))return '';
  const G=gebieden||(typeof AREAS!=='undefined'?AREAS:null);
  const g=m.regio&&G&&G[m.regio]?G[m.regio].naam:'';
  if(g&&!m.app&&!m.grape&&!t.toLowerCase().includes(g.toLowerCase()))t=g+' '+t;
  return t;
}
function winkelUrl(shop,term){return shop.url.replace('{q}',encodeURIComponent(term))}
function winkelTest(){try{return /[?&]winkeltest(=1)?(&|$)/.test(location.search)}catch(e){return false}}
function zichtbareWinkels(){const t=winkelTest();return SHOPS.filter(s=>s.ok||t)}
if(typeof module!=='undefined')module.exports={SHOPS,zoekterm,winkelUrl,zichtbareWinkels};
