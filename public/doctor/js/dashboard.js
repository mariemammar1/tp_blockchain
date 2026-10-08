// public/doctor/js/dashboard.js
requireRole('medecin');
document.getElementById('doctorName').textContent = 'Dr ' + (localStorage.getItem('name') || '');

async function loadDoctorProfile() {
  try {
    const profile = await apiFetch('/api/doctor/profile');
    document.getElementById('doctorProfileDetails').textContent =
      `Spécialité : ${profile.specialty || 'Non spécifiée'} · Email : ${profile.email}`;

    document.getElementById('doctorNameInput').value = profile.name || '';
    document.getElementById('doctorEmailInput').value = profile.email || '';
    document.getElementById('doctorSpecialtyInput').value = profile.specialty || '';
    document.getElementById('doctorCurrentPassword').value = '';
    document.getElementById('doctorNewPassword').value = '';
    document.getElementById('doctorConfirmPassword').value = '';
  } catch (err) {
    console.error(err);
  }
}

async function updateDoctorProfile(event) {
  event.preventDefault();
  const msgEl = document.getElementById('doctorProfileMsg');
  msgEl.className = '';
  msgEl.textContent = '';

  const name = document.getElementById('doctorNameInput').value.trim();
  const email = document.getElementById('doctorEmailInput').value.trim();
  const specialty = document.getElementById('doctorSpecialtyInput').value.trim();
  const currentPassword = document.getElementById('doctorCurrentPassword').value;
  const newPassword = document.getElementById('doctorNewPassword').value;
  const confirmPassword = document.getElementById('doctorConfirmPassword').value;

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
    const res = await apiFetch('/api/doctor/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name,
        email,
        currentPassword,
        newPassword,
        confirmPassword
      })
    });

    localStorage.setItem('name', res.user.name);
    document.getElementById('doctorName').textContent = 'Dr ' + res.user.name;

    msgEl.className = 'success-msg';
    msgEl.textContent = res.message || 'Profil mis à jour avec succès.';

    document.getElementById('doctorCurrentPassword').value = '';
    document.getElementById('doctorNewPassword').value = '';
    document.getElementById('doctorConfirmPassword').value = '';

    await loadDoctorProfile();
  } catch (err) {
    msgEl.className = 'error-msg';
    msgEl.textContent = err.message || 'Erreur lors de la mise à jour.';
  }
}

async function loadPatients() {
  try {
    const patients = await apiFetch('/api/doctor/patients');
    const tbody = document.getElementById('patientsBody');
    const emptyState = document.getElementById('emptyState');
    tbody.innerHTML = '';

    if (patients.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    patients.forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.name}</td>
        <td>${p.email}</td>
        <td>${p.birth_date || '-'}</td>
        <td>${p.gender || '-'}</td>
        <td><button class="link-btn" onclick="openPatient(${p.patient_id})">Voir le dossier →</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    alert(err.message);
  }
}

function openPatient(patientId) {
  window.location.href = `patient.html?id=${patientId}`;
}

loadDoctorProfile();
loadPatients();
