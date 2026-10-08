// public/patient/js/dashboard.js
requireRole('patient');
document.getElementById('patientNameTop').textContent = localStorage.getItem('name') || '';

async function loadProfile() {
  try {
    const profile = await apiFetch('/api/patient/profile');
    document.getElementById('profileDetails').textContent =
      `Informations : Né(e) le ${profile.birth_date || 'N/A'} · Genre : ${profile.gender || 'N/A'}${profile.blood_type ? ' · Groupe : ' + profile.blood_type : ''}`;

    document.getElementById('patientName').value = profile.name || '';
    document.getElementById('patientEmail').value = profile.email || '';
    document.getElementById('patientBirthDate').value = profile.birth_date || '';
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  } catch (err) {
    console.error(err);
  }
}

async function updateProfile(event) {
  event.preventDefault();
  const msgEl = document.getElementById('profileMsg');
  msgEl.className = '';
  msgEl.textContent = '';

  const name = document.getElementById('patientName').value.trim();
  const email = document.getElementById('patientEmail').value.trim();
  const birth_date = document.getElementById('patientBirthDate').value;
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!name || !email) {
    msgEl.className = 'error-msg';
    msgEl.textContent = 'Veuillez remplir tous les champs obligatoires.';
    return;
  }

  if (newPassword || confirmPassword) {
    if (!currentPassword) {
      msgEl.className = 'error-msg';
      msgEl.textContent = 'Le mot de passe actuel est obligatoire si vous souhaitez changer de mot de passe.';
      return;
    }
    if (newPassword !== confirmPassword) {
      msgEl.className = 'error-msg';
      msgEl.textContent = 'Le nouveau mot de passe et sa confirmation ne correspondent pas.';
      return;
    }
  }

  try {
    const res = await apiFetch('/api/patient/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name,
        email,
        birth_date,
        currentPassword,
        newPassword,
        confirmPassword
      })
    });

    localStorage.setItem('name', res.user.name);
    document.getElementById('patientNameTop').textContent = res.user.name;

    msgEl.className = 'success-msg';
    msgEl.textContent = res.message || 'Profil mis à jour avec succès.';

    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';

    await loadProfile();
  } catch (err) {
    msgEl.className = 'error-msg';
    msgEl.textContent = err.message || 'Erreur lors de la mise à jour.';
  }
}

async function loadDossier() {
  try {
    const dossier = await apiFetch('/api/patient/dossier');
    const container = document.getElementById('dossierContainer');
    container.innerHTML = '';

    if (dossier.consultations.length === 0) {
      container.innerHTML = '<div class="empty-state">Aucune consultation pour le moment.</div>';
      return;
    }

    dossier.consultations.forEach((c) => {
      const block = document.createElement('div');
      block.className = 'consultation-block';

      let diagnosticsHtml = c.diagnostics.length
        ? '<ul class="sub-list">' + c.diagnostics.map(d => `<li>🩺 ${d.description}</li>`).join('') + '</ul>'
        : '<p style="font-size:13px;color:#94a3b8;">Aucun diagnostic.</p>';

      let prescriptionsHtml = c.prescriptions.length
        ? '<ul class="sub-list">' + c.prescriptions.map(p =>
            `<li>💊 <strong>${p.medication}</strong> ${p.dosage ? '- ' + p.dosage : ''} ${p.duration ? '(' + p.duration + ')' : ''}${p.instructions ? '<br><em>' + p.instructions + '</em>' : ''}</li>`
          ).join('') + '</ul>'
        : '<p style="font-size:13px;color:#94a3b8;">Aucune prescription.</p>';

      block.innerHTML = `
        <div class="consultation-header">
          <span class="date">${formatDate(c.date)}</span>
          <span class="badge">Dr ${c.doctor_name}</span>
        </div>
        <p><strong>Motif:</strong> ${c.reason || '-'}</p>
        <p><strong>Notes:</strong> ${c.notes || '-'}</p>
        <p><strong>Diagnostics</strong></p>
        ${diagnosticsHtml}
        <p><strong>Prescriptions</strong></p>
        ${prescriptionsHtml}
      `;
      container.appendChild(block);
    });
  } catch (err) {
    console.error(err);
  }
}

loadProfile();
loadDossier();
