// routes/patient.routes.js
const express = require('express');
const db = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { hashPassword, comparePassword } = require('../utils/password');

const router = express.Router();
router.use(verifyToken, requireRole('patient'));

// GET /api/patient/profile
router.get('/profile', (req, res) => {
  const profile = db
    .prepare(
      `SELECT pp.id as patient_id, u.name, u.email, pp.birth_date, pp.gender, pp.blood_type, pp.phone, pp.address
       FROM patient_profiles pp JOIN users u ON u.id = pp.user_id
       WHERE pp.id = ?`
    )
    .get(req.user.profileId);

  if (!profile) return res.status(404).json({ error: 'Profil introuvable.' });
  res.json(profile);
});

// PUT /api/patient/profile
router.put('/profile', (req, res) => {
  const { name, email, birth_date, currentPassword, newPassword, confirmPassword } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Le nom est requis.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: "L'email est requis." });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanBirthDate = birth_date ? birth_date.trim() : null;

  if (cleanBirthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanBirthDate)) {
      return res.status(400).json({ error: 'La date de naissance est invalide.' });
    }
    const birthDateObj = new Date(`${cleanBirthDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = cleanBirthDate.split('-').map(Number);
    if (
      Number.isNaN(birthDateObj.getTime()) ||
      birthDateObj.getFullYear() !== year ||
      birthDateObj.getMonth() !== month - 1 ||
      birthDateObj.getDate() !== day
    ) {
      return res.status(400).json({ error: 'La date de naissance est invalide.' });
    }
    if (birthDateObj > today) {
      return res.status(400).json({ error: 'La date de naissance ne peut pas etre dans le futur.' });
    }
  }

  const existingUser = db
    .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
    .get(cleanEmail, req.user.id);

  if (existingUser) {
    return res.status(409).json({ error: 'Cet email est deja utilise par un autre compte.' });
  }

  const isChangingPassword = Boolean(newPassword || confirmPassword);
  if (isChangingPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Le mot de passe actuel est requis pour changer votre mot de passe.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Les nouveaux mots de passe ne correspondent pas.' });
    }
    if (newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 4 caracteres.' });
    }

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    if (!user || !comparePassword(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    }

    const hashed = hashPassword(newPassword.trim());
    db.prepare('UPDATE users SET name = ?, email = ?, password = ? WHERE id = ?').run(
      cleanName,
      cleanEmail,
      hashed,
      req.user.id
    );
  } else {
    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(
      cleanName,
      cleanEmail,
      req.user.id
    );
  }

  db.prepare('UPDATE patient_profiles SET birth_date = ? WHERE id = ?').run(
    cleanBirthDate,
    req.user.profileId
  );

  res.json({
    message: 'Profil mis a jour avec succes.',
    user: { name: cleanName, email: cleanEmail, birth_date: cleanBirthDate }
  });
});


// GET /api/patient/consultations
router.get('/consultations', (req, res) => {
  const consultations = db
    .prepare(
      `SELECT c.id, c.date, c.reason, c.notes, u.name as doctor_name
       FROM consultations c
       JOIN doctor_profiles dp ON dp.id = c.doctor_id
       JOIN users u ON u.id = dp.user_id
       WHERE c.patient_id = ?
       ORDER BY c.date DESC`
    )
    .all(req.user.profileId);
  res.json(consultations);
});

// GET /api/patient/prescriptions
router.get('/prescriptions', (req, res) => {
  const prescriptions = db
    .prepare(
      `SELECT p.*, c.date as consultation_date, u.name as doctor_name
       FROM prescriptions p
       JOIN consultations c ON c.id = p.consultation_id
       JOIN doctor_profiles dp ON dp.id = c.doctor_id
       JOIN users u ON u.id = dp.user_id
       WHERE c.patient_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(req.user.profileId);
  res.json(prescriptions);
});

// GET /api/patient/dossier  (dossier medical complet : consultations + diagnostics + prescriptions)
router.get('/dossier', (req, res) => {
  const patientId = req.user.profileId;

  const consultations = db
    .prepare(
      `SELECT c.id, c.date, c.reason, c.notes, u.name as doctor_name
       FROM consultations c
       JOIN doctor_profiles dp ON dp.id = c.doctor_id
       JOIN users u ON u.id = dp.user_id
       WHERE c.patient_id = ?
       ORDER BY c.date DESC`
    )
    .all(patientId);

  const consultationIds = consultations.map((c) => c.id);
  let diagnostics = [];
  let prescriptions = [];
  if (consultationIds.length > 0) {
    const placeholders = consultationIds.map(() => '?').join(',');
    diagnostics = db
      .prepare(`SELECT * FROM diagnostics WHERE consultation_id IN (${placeholders})`)
      .all(...consultationIds);
    prescriptions = db
      .prepare(`SELECT * FROM prescriptions WHERE consultation_id IN (${placeholders})`)
      .all(...consultationIds);
  }

  const result = consultations.map((c) => ({
    ...c,
    diagnostics: diagnostics.filter((d) => d.consultation_id === c.id),
    prescriptions: prescriptions.filter((p) => p.consultation_id === c.id),
  }));

  res.json({ consultations: result });
});

module.exports = router;
