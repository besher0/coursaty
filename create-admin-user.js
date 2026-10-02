const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const payload = {
  phone: '0984412188',
  password: '00000000',
  userableType: 'ADMIN',
  userableId: '4fec964d-4266-4011-b261-415b22804d7f',
};

(async () => {
  const prisma = new PrismaClient();

  try {
    const adminExists = await prisma.admin.findUnique({ where: { id: payload.userableId } });
    if (!adminExists) {
      await prisma.admin.create({ data: { id: payload.userableId, name: 'Admin' } });
      console.log('Created missing admin profile for id:', payload.userableId);
    } else {
      console.log('Admin profile already exists for id:', payload.userableId);
    }

    const existingUser = await prisma.user.findUnique({ where: { phone: payload.phone } });
    const hash = await bcrypt.hash(payload.password, 10);
    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            password: hash,
            userableId: payload.userableId,
            userableType: payload.userableType,
            status: 'active',
            gender: 'MALE',
          },
        })
      : await prisma.user.create({
          data: {
            phone: payload.phone,
            password: hash,
            userableId: payload.userableId,
            userableType: payload.userableType,
            status: 'active',
            gender: 'MALE',
          },
        });

    console.log(JSON.stringify({
      id: user.id,
      phone: user.phone,
      userableId: user.userableId,
      userableType: user.userableType,
      status: user.status,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})();
