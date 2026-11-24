# DOMA – navodila za postavitev

Aplikacija je spletna stran (PWA), ki jo vsak doda na domači zaslon telefona. Podatki so v brezplačni bazi Supabase, stran gostuje brezplačno na GitHub Pages.

## 1. Supabase (baza, ~5 min)
1. Pojdi na https://supabase.com in se prijavi (lahko z GitHub računom).
2. **New project**: ime `doma`, geslo si izmisli (shrani ga), regija **Central EU (Frankfurt)**, plan **Free**.
3. Ko je projekt pripravljen: levo **SQL Editor > New query**, prilepi celotno vsebino datoteke `supabase.sql` in klikni **Run**.
4. **Project Settings > API** (ali **Connect**): skopiraj **Project URL** in **anon / publishable key**.
5. Oboje pošlji Claudu v nit (ključ "anon" je namenjen javni uporabi v aplikaciji, ni skrivnost).

## 2. GitHub (gostovanje, ~3 min)
1. Na https://github.com/new ustvari prazen **javen** repozitorij, npr. `doma`.
2. Claudu napiši ime repozitorija. Claude naloži aplikacijo in vklopi GitHub Pages.
3. Naslov bo `https://<tvoje-ime>.github.io/doma/`.

## 3. Na telefonu
- **iPhone (Safari):** odpri naslov > gumb Deli > **Dodaj na začetni zaslon**.
- **Android (Chrome):** odpri naslov > ⋮ > **Namesti aplikacijo** / Dodaj na začetni zaslon.
- Ob prvem odprtju izbereš, kdo si.

Če aplikacija javi "permission denied for table items", v SQL Editorju zaženi:
`grant select, insert, update, delete on public.items to anon;`

## Varnost
Kdor pozna naslov strani, lahko vidi in spreminja podatke. Za družino je to v redu, le povezave ne deli javno.

## Kako deluje
- Vsak dan: 🐶 sprehod Zuma popoldne (do 19:00) in 🍽️ posoda (do 21:00).
- Enkrat na teden (do nedelje 20:00): tla sesanje, tla pomivanje, kopalnica/WC. Dvakrat na teden (do srede in do nedelje 20:00): smeti, perilo pranje, perilo zlaganje/likanje.
- Vsak izbere enako število opravil na teden (skupno število / 4, zaokroženo navzgor).
- V zavihku **Plan** si vsak sam izbere opravila in dneve, ko ima Zuma. Vrstice kažejo, koliko točk ima kdo glede na pravičen delež.
- Kar ostane prosto, se samodejno dodeli tistemu z najmanj točkami ta teden: dnevna opravila isti dan ob 12:00, tedenska v sredo ob 20:00.
- Ostali ocenijo opravljeno (1–5★): 5★ = 125 %, 3★ = 95 %, 1★ = 65 % XP. Prevzem tujega opravila +20 %.
- Kazni: zamuda −25 % XP, neopravljeno 24 h po roku −50 % XP opravila.
- Pomotoma odkljukano opravilo vrneš z "↩ Razveljavi".
- Opravila, XP in roke se spremenijo na vrhu datoteke `app.js`.
