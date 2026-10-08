// routes/doctor.routes.js
const express = require('express');
const db = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { hashPassword, comparePassword } = require('../utils/password');

const router = express.Router();
router.use(verifyToken, requireRole('medecin'));

// GET /api/doctor/profile
router.get('/profile', (req, res) => {
  const profile = db
    .prepare(
      `SELECT dp.id as doctor_id, u.name, u.email, dp.specialty, dp.phone
       FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id
       WHERE dp.id = ?`
    )
    .get(req.user.profileId);

  if (!profile) return res.status(404).json({ error: 'Profil introuvable.' });
  res.json(profile);
});

// PUT /api/doctor/profile
router.put('/profile', (req, res) => {
  const { name, email, currentPassword, newPassword, confirmPassword } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Le nom est requis.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: "L'email est requis." });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

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

  const docProfile = db.prepare('SELECT specialty FROM doctor_profiles WHERE id = ?').get(req.user.profileId);

  res.json({
    message: 'Profil mis a jour avec succes.',
    user: { name: cleanName, email: cleanEmail, specialty: docProfile ? docProfile.specialty : null }
  });
});

// GET /api/doctor/patients
// Liste des patients assignes a ce medecin seulement.
router.get('/patients', (req, res) => {
  const doctorProfileId = req.user.profileId;

  const patients = db
    .prepare(
      `SELECT pp.id as patient_id, u.name, u.email, pp.birth_date, pp.gender, pp.blood_type
       FROM patient_doctor_assignments pda
       JOIN patient_profiles pp ON pp.id = pda.patient_id
       JOIN users u ON u.id = pp.user_id
       WHERE pda.doctor_id = ?
       ORDER BY u.name ASC`
    )
    .all(doctorProfileId);

  res.json(patients);
});

// Fonction utilitaire: construit le dossier medical complet d'un patient
function buildDossier(patientId, doctorProfileId = null) {
  const patient = db
    .prepare(
      `SELECT pp.id as patient_id, u.name, u.email, pp.birth_date, pp.gender, pp.blood_type, pp.phone, pp.address
       FROM patient_profiles pp JOIN users u ON u.id = pp.user_id
       WHERE pp.id = ?`
    )
    .get(patientId);

  if (!patient) return null;

  if (doctorProfileId) {
    const assignment = db
      .prepare('SELECT 1 FROM patient_doctor_assignments WHERE patient_id = ? AND doctor_id = ?')
      .get(patientId, doctorProfileId);

    if (!assignment) {
      return null;
    }
  }

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
      .prepare(
        `SELECT * FROM diagnostics WHERE consultation_id IN (${placeholders}) ORDER BY created_at DESC`
      )
      .all(...consultationIds);
    prescriptions = db
      .prepare(
        `SELECT * FROM prescriptions WHERE consultation_id IN (${placeholders}) ORDER BY created_at DESC`
      )
      .all(...consultationIds);
  }

  const consultationsWithDetails = consultations.map((c) => ({
    ...c,
    diagnostics: diagnostics.filter((d) => d.consultation_id === c.id),
    prescriptions: prescriptions.filter((p) => p.consultation_id === c.id),
  }));

  return { patient, consultations: consultationsWithDetails };
}

// GET /api/doctor/patients/:id/dossier
router.get('/patients/:id/dossier', (req, res) => {
  const dossier = buildDossier(Number(req.params.id), req.user.profileId);
  if (!dossier) return res.status(404).json({ error: 'Patient introuvable ou non assigne a ce medecin.' });
  res.json(dossier);
});

// GET /api/doctor/patients/:id/historique  (alias explicite demande par le besoin fonctionnel)
router.get('/patients/:id/historique', (req, res) => {
  const dossier = buildDossier(Number(req.params.id), req.user.profileId);
  if (!dossier) return res.status(404).json({ error: 'Patient introuvable ou non assigne a ce medecin.' });
  res.json(dossier.consultations);
});

// POST /api/doctor/consultations
// body: { patient_id, reason, notes }
router.post('/consultations', (req, res) => {
  const { patient_id, reason, notes } = req.body;
  if (!patient_id) return res.status(400).json({ error: 'patient_id requis.' });

  const doctorId = req.user.profileId;
  const assignment = db
    .prepare('SELECT 1 FROM patient_doctor_assignments WHERE patient_id = ? AND doctor_id = ?')
    .get(patient_id, doctorId);

  if (!assignment) {
    return res.status(403).json({ error: 'Ce patient n\'est pas assigne a ce medecin.' });
  }

  const info = db
    .prepare(
      `INSERT INTO consultations (patient_id, doctor_id, reason, notes) VALUES (?, ?, ?, ?)`
    )
    .run(patient_id, doctorId, reason || null, notes || null);
  const consultationId = info.lastInsertRowid;

  const created = db.prepare('SELECT * FROM consultations WHERE id = ?').get(consultationId);
  res.status(201).json(created);
});

// POST /api/doctor/diagnostics
// body: { consultation_id, description }
router.post('/diagnostics', (req, res) => {
  const { consultation_id, description } = req.body;
  if (!consultation_id || !description) {
    return res.status(400).json({ error: 'consultation_id et description requis.' });
  }

  const consultation = db
    .prepare('SELECT * FROM consultations WHERE id = ? AND doctor_id = ?')
    .get(consultation_id, req.user.profileId);
  if (!consultation) {
    return res.status(403).json({ error: 'Consultation introuvable ou non autorisee.' });
  }

  const info = db
    .prepare('INSERT INTO diagnostics (consultation_id, description) VALUES (?, ?)')
    .run(consultation_id, description);
  const diagnosticId = info.lastInsertRowid;

  const created = db.prepare('SELECT * FROM diagnostics WHERE id = ?').get(diagnosticId);
  res.status(201).json(created);
});

// POST /api/doctor/prescriptions
// body: { consultation_id, medication, dosage, duration, instructions }
router.post('/prescriptions', (req, res) => {
  const { consultation_id, medication, dosage, duration, instructions } = req.body;
  if (!consultation_id || !medication) {
    return res.status(400).json({ error: 'consultation_id et medication requis.' });
  }

  const consultation = db
    .prepare('SELECT * FROM consultations WHERE id = ? AND doctor_id = ?')
    .get(consultation_id, req.user.profileId);
  if (!consultation) {
    return res.status(403).json({ error: 'Consultation introuvable ou non autorisee.' });
  }

  const info = db
    .prepare(
      `INSERT INTO prescriptions (consultation_id, medication, dosage, duration, instructions)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(consultation_id, medication, dosage || null, duration || null, instructions || null);
  const prescriptionId = info.lastInsertRowid;

  const created = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(prescriptionId);
  res.status(201).json(created);
});

module.exports = router;
