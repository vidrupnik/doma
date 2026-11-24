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

## Varnost
Kdor pozna naslov strani, lahko vidi in spreminja podatke. Za družino je to v redu, le povezave ne deli javno.

## Kako deluje
- Dnevno: posoda (do 21:00) in dva sprehoda Zume (zjutraj do 10:00, zvečer do 21:00) se vsak dan zavrtijo, vsak dan jih ima drug član.
- Tedensko: kopalnica, tla + sesanje, perilo (rok nedelja 20:00) se vsak teden zavrtijo.
- Ostali ocenijo opravljeno (1–5★). XP: 5★ = 125 %, 3★ = 95 %, 1★ = 65 %, zamuda −30 %, prevzem tujega opravila +20 %.
- Opravila, XP in roke se spremenijo na vrhu datoteke `app.js`.
