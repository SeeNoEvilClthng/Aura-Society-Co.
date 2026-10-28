// Short introductions shown at the top of brand pages and used for their Google
// descriptions. Keys match the collection names exactly.
const BRAND_INTROS = {
  "Creed": "Founded in London and now based in Paris, Creed is famous for Aventus, Green Irish Tweed and Silver Mountain Water: polished, long-lasting scents made with natural ingredients.",
  "Tom Ford": "Tom Ford fragrances are bold, sensual and unmistakably luxurious, from the Private Blend icons Tobacco Vanille, Oud Wood and Lost Cherry to signatures like Ombre Leather and Noir Extreme.",
  "Parfums de Marly": "Inspired by the court of King Louis XV, Parfums de Marly creates refined, crowd-pleasing scents like Layton, Delina, Pegasus and Herod, each in its signature horse-crest bottle.",
  "Maison Francis Kurkdjian": "Paris perfumer Francis Kurkdjian is behind Baccarat Rouge 540, one of the most recognized scents in the world, along with Grand Soir, Gentle Fluidity and the Aqua collection.",
  "Chanel": "From the legendary N°5 to Coco Mademoiselle, Chance and Bleu de Chanel, Chanel fragrances define timeless Parisian elegance.",
  "Dior": "Dior fragrances range from the best-selling Sauvage to the radiant J'adore and the romantic Miss Dior: modern classics from the house of Christian Dior.",
  "Yves Saint Laurent": "Yves Saint Laurent fragrances are confident and seductive, including Libre, Black Opium, Y, La Nuit de L'Homme and MYSLF.",
  "ARMANI": "Giorgio Armani fragrances are effortlessly elegant, from the iconic Acqua di Gio and Armani Code to Si, My Way and the warm Stronger With You line.",
  "Versace": "Versace fragrances are bold and glamorous, led by the best-selling Eros, Dylan Blue and the Bright Crystal collection.",
  "Dolce & Gabbana": "Dolce & Gabbana fragrances capture Mediterranean life, from the sunny Light Blue to the warm, sophisticated The One.",
  "Jean Paul Gaultier": "Jean Paul Gaultier's sculpted bottles hold some of the most complimented scents around, including Le Male, Le Beau, Scandal and La Belle.",
  "Carolina Herrera": "Carolina Herrera fragrances are playful and glamorous, from the stiletto-shaped Good Girl bottles to Bad Boy and the 212 collection.",
  "Prada": "Prada fragrances blend clean modern style with Italian luxury, including Paradoxe, Candy and the sporty Luna Rossa line.",
  "Gucci": "Gucci fragrances range from the floral Flora Gorgeous and Bloom collections to Guilty and the artisanal Alchemist's Garden.",
  "Valentino": "Valentino's Born in Roma collection, with its studded couture bottles, is one of today's most popular fragrance lines for both women and men.",
  "Louis Vuitton": "Louis Vuitton fragrances are crafted by master perfumer Jacques Cavallier Belletrud, from the sunny Cologne Perfumes like Afternoon Swim and Pacific Chill to the rich Ombre Nomade.",
  "Bond No. 9 New York": "Bond No. 9 celebrates New York City, with each scent named for a neighborhood, in its iconic star-shaped bottle.",
  "Amouage": "Amouage, from Oman, is one of the world's most celebrated luxury perfume houses, known for rich, complex creations like Interlude, Reflection and Guidance.",
  "Le Labo": "Le Labo hand-blends every bottle to order. Its minimalist, unisex scents like Santal 33 and Another 13 have a cult following.",
  "Byredo": "Stockholm-based Byredo creates modern, minimalist scents with emotional stories, including Gypsy Water, Mojave Ghost and Bal d'Afrique.",
  "Kilian Paris": "Kilian Paris crafts indulgent, boozy and seductive fragrances, including Angels' Share and Love, Don't Be Shy, in collectible refillable bottles.",
  "Xerjoff": "Italian house Xerjoff makes opulent, high-quality fragrances like Naxos and Erba Pura, known for their richness and longevity.",
  "INITIO": "Initio Parfums Prives creates bold, sensual fragrances built around powerful raw materials, including Oud for Greatness and Side Effect.",
  "Lattafa": "Dubai's Lattafa offers rich, long-lasting Middle Eastern fragrances like Khamrah, Asad and Yara, famous on social media for luxury-level performance.",
  "Armaf": "Armaf is best known for Club de Nuit Intense Man, one of the most popular fragrances of the decade, plus the playful Odyssey collection.",
  "Afnan": "Afnan creates powerful, long-lasting Middle Eastern fragrances, including the viral 9pm and the Supremacy collection.",
  "Kayali": "Founded by Mona Kattan, Kayali makes sweet, layerable fragrances numbered by their creation, including Vanilla 28 and Yum Pistachio Gelato 33.",
  "Maison Margiela": "Maison Margiela's Replica collection recreates familiar memories and places, like By the Fireplace, Jazz Club and Lazy Sunday Morning.",
  "Rabanne": "Rabanne makes bold, attention-grabbing fragrances, including the gold-bar 1 Million and the trophy-shaped Invictus.",
  "Azzaro": "Azzaro is best known for the warm, spicy Wanted collection, including the award-winning The Most Wanted.",
  "Burberry": "Burberry fragrances bring British heritage to modern scents, including Her, Hero and the vanilla-lavender Goddess.",
  "Hermes": "Hermès fragrances are understated and refined, led by the iconic Terre d'Hermès and the Un Jardin collection.",
  "Jo Malone London": "Jo Malone London is known for simple, elegant colognes designed to be layered, including Wood Sage & Sea Salt and English Pear & Freesia.",
  "Al Haramain": "Al Haramain has made Middle Eastern perfumes since 1970. Its Amber Oud collection is loved for sweet, powerful and long-lasting scents."
};

function brandIntro(collection) {
  return BRAND_INTROS[String(collection || "").trim()] || "";
}

module.exports = { brandIntro };
