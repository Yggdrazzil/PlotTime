// Compte de DÉMO pour la review Apple/Google (l'app est login-gated : la review
// a besoin d'un identifiant). Crée un compte e-mail/mot de passe CONNECTABLE,
// même quand l'inscription publique est coupée (ALLOW_EMAIL_SIGNUP=false) — le
// login e-mail, lui, reste toujours ouvert. À lancer sur le serveur de prod :
//
//   pnpm --filter @serietime/server create-demo-user -- <email> <motdepasse>
//   # ou via variables d'env :
//   DEMO_EMAIL=... DEMO_PASSWORD=... pnpm --filter @serietime/server create-demo-user
//
// Mot de passe : 8 caractères minimum. Idempotent : si l'e-mail existe déjà,
// son mot de passe est mis à jour (pratique pour rejouer avant une review).
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db/client.js';
import { env } from '../src/config/env.js';

const email = (process.argv[2] ?? process.env.DEMO_EMAIL ?? '').trim().toLowerCase();
const password = process.argv[3] ?? process.env.DEMO_PASSWORD ?? '';

async function main(): Promise<void> {
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('e-mail invalide. usage : create-demo-user -- <email> <motdepasse>');
  }
  if (password.length < 8) throw new Error('mot de passe : 8 caractères minimum.');
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
    console.log(`♻️  Compte existant ${email} : mot de passe mis à jour.`);
  } else {
    await prisma.user.create({
      data: {
        email,
        displayName: 'Démo review',
        provider: 'password',
        passwordHash,
        countryCode: env.DEFAULT_COUNTRY,
      },
    });
    console.log(`✅ Compte de démo créé : ${email}`);
  }
  console.log('   → à saisir dans App Store Connect › App Review Information (« Sign-in required »).');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
