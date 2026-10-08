// public/doctor/js/patient.js
requireRole('medecin');
document.getElementById('doctorName').textContent = 'Dr ' + (localStorage.getItem('name') || '');

const params = new URLSearchParams(window.location.search);
const patientId = params.get('id');
if (!patientId) window.location.href = 'dashboard.html';

let currentDossier = null;

async function loadDossier() {
  try {
    const dossier = await apiFetch(`/api/doctor/patients/${patientId}/dossier`);
    currentDossier = dossier;
    renderPatientInfo(dossier.patient);
    renderHistory(dossier.consultations);
    renderConsultationSelect(dossier.consultations);
    computeMedicalRecordHash(dossier);
    await readContractData();
    if (typeof runIntegrityAudit === 'function') {
      runIntegrityAudit();
    }
  } catch (err) {
    alert(err.message);
  }
}

function renderPatientInfo(patient) {
  document.getElementById('patientName').textContent = patient.name;
  document.getElementById('patientDetails').textContent =
    `${patient.email} · Né(e) le ${patient.birth_date || 'N/A'} · ${patient.gender || ''} ${patient.blood_type ? '· Groupe: ' + patient.blood_type : ''}`;
}

function renderConsultationSelect(consultations) {
  const select = document.getElementById('targetConsultation');
  select.innerHTML = '';
  if (consultations.length === 0) {
    select.innerHTML = '<option value="">Aucune consultation - créez-en une d\'abord</option>';
    return;
  }
  consultations.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${formatDate(c.date)} — ${c.reason || 'Sans motif'}`;
    select.appendChild(opt);
  });
}

function renderHistory(consultations) {
  const container = document.getElementById('historyContainer');
  container.innerHTML = '';

  if (consultations.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucune consultation enregistrée.</div>';
    return;
  }

  consultations.forEach((c) => {
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
}

document.getElementById('consultationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('consultationError');
  errorEl.textContent = '';
  try {
    await apiFetch('/api/doctor/consultations', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: Number(patientId),
        reason: document.getElementById('reason').value,
        notes: document.getElementById('notes').value,
      }),
    });
    document.getElementById('consultationForm').reset();
    loadDossier();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('diagnosticForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('subFormError');
  errorEl.textContent = '';
  const consultationId = document.getElementById('targetConsultation').value;
  if (!consultationId) {
    errorEl.textContent = 'Créez d\'abord une consultation.';
    return;
  }
  try {
    await apiFetch('/api/doctor/diagnostics', {
      method: 'POST',
      body: JSON.stringify({
        consultation_id: Number(consultationId),
        description: document.getElementById('diagnosticDescription').value,
      }),
    });
    document.getElementById('diagnosticForm').reset();
    loadDossier();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('prescriptionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('subFormError');
  errorEl.textContent = '';
  const consultationId = document.getElementById('targetConsultation').value;
  if (!consultationId) {
    errorEl.textContent = 'Créez d\'abord une consultation.';
    return;
  }
  try {
    await apiFetch('/api/doctor/prescriptions', {
      method: 'POST',
      body: JSON.stringify({
        consultation_id: Number(consultationId),
        medication: document.getElementById('medication').value,
        dosage: document.getElementById('dosage').value,
        duration: document.getElementById('duration').value,
        instructions: document.getElementById('instructions').value,
      }),
    });
    document.getElementById('prescriptionForm').reset();
    loadDossier();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

loadDossier();

// ==========================================
// PARTIE 2 — GESTION DU PORTEFEUILLE METAMASK
// ==========================================

const TARGET_CHAIN_ID = 31337;
const TARGET_CHAIN_ID_HEX = '0x7a69';
const TARGET_CHAIN_NAME = 'Hardhat Localhost';
const TARGET_RPC_URL = 'http://127.0.0.1:8545';

const connectWalletBtn = document.getElementById('connectWalletBtn');
const connectWalletBtnText = document.getElementById('connectWalletBtnText');
const switchNetworkBtn = document.getElementById('switchNetworkBtn');
const walletStatusBadge = document.getElementById('walletStatusBadge');
const walletStatusText = document.getElementById('walletStatusText');
const walletAlert = document.getElementById('walletAlert');
const walletDetails = document.getElementById('walletDetails');
const walletAccountEl = document.getElementById('walletAccount');
const walletNetworkEl = document.getElementById('walletNetwork');
const walletChainIdEl = document.getElementById('walletChainId');

let walletProvider = null;
let walletSigner = null;
let connectedAccount = null;

function showWalletAlert(type, messageHtml) {
  if (!walletAlert) return;
  walletAlert.className = `wallet-alert alert-${type}`;
  walletAlert.innerHTML = messageHtml;
  walletAlert.classList.remove('hidden');
}

function hideWalletAlert() {
  if (!walletAlert) return;
  walletAlert.className = 'wallet-alert hidden';
  walletAlert.innerHTML = '';
}

function setWalletStatus(status, text) {
  if (!walletStatusBadge || !walletStatusText) return;
  walletStatusBadge.className = `status-badge status-${status}`;
  walletStatusText.textContent = text;
}

function getNetworkDetails(chainIdNumber) {
  const id = Number(chainIdNumber);
  switch (id) {
    case 31337:
      return { name: 'Hardhat Localhost', isTarget: true };
    case 1337:
      return { name: 'Localhost (Ganache)', isTarget: true };
    case 1:
      return { name: 'Ethereum Mainnet', isTarget: false };
    case 11155111:
      return { name: 'Sepolia Testnet', isTarget: false };
    case 5:
      return { name: 'Goerli Testnet', isTarget: false };
    case 17000:
      return { name: 'Holesky Testnet', isTarget: false };
    default:
      return { name: `Réseau inconnu (${id})`, isTarget: false };
  }
}

async function updateWalletState() {
  if (!window.ethereum) {
    setWalletStatus('disconnected', 'Non disponible');
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (!accounts || accounts.length === 0) {
      connectedAccount = null;
      if (walletDetails) walletDetails.classList.add('hidden');
      setWalletStatus('disconnected', 'Non connecté');
      if (connectWalletBtnText) connectWalletBtnText.textContent = 'Connecter MetaMask';
      if (switchNetworkBtn) switchNetworkBtn.classList.add('hidden');
      return;
    }

    connectedAccount = accounts[0];
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);
    const netInfo = getNetworkDetails(chainId);

    // Initialiser ethers provider & signer si la librairie est chargée
    if (window.ethers) {
      try {
        walletProvider = new window.ethers.BrowserProvider(window.ethereum);
        walletSigner = await walletProvider.getSigner();
        window.doctorProvider = walletProvider;
        window.doctorSigner = walletSigner;
      } catch (err) {
        console.warn('Initialisation ethers:', err);
      }
    }

    // Affichage des informations demandées
    if (walletAccountEl) {
      walletAccountEl.textContent = connectedAccount;
      walletAccountEl.title = connectedAccount;
    }
    if (walletNetworkEl) {
      walletNetworkEl.textContent = netInfo.name;
    }
    if (walletChainIdEl) {
      walletChainIdEl.textContent = `${chainId} (${chainIdHex})`;
    }

    if (walletDetails) walletDetails.classList.remove('hidden');
    if (connectWalletBtnText) {
      connectWalletBtnText.textContent = `${connectedAccount.slice(0, 6)}...${connectedAccount.slice(-4)}`;
    }

    // Détection : Mauvais réseau
    if (!netInfo.isTarget) {
      setWalletStatus('warning', 'Mauvais réseau');
      showWalletAlert(
        'warning',
        `⚠️ <strong>Mauvais réseau détecté :</strong> Vous êtes connecté à <strong>${netInfo.name}</strong> (Chain ID : <strong>${chainId}</strong>). Le réseau requis est <strong>${TARGET_CHAIN_NAME}</strong> (Chain ID : <strong>${TARGET_CHAIN_ID}</strong>).`
      );
      if (switchNetworkBtn) switchNetworkBtn.classList.remove('hidden');
    } else {
      setWalletStatus('connected', `Connecté (${netInfo.name})`);
      hideWalletAlert();
      if (switchNetworkBtn) switchNetworkBtn.classList.add('hidden');
      readContractData();
    }
  } catch (err) {
    console.error('Erreur mise à jour wallet:', err);
  }
}

async function connectMetaMask() {
  hideWalletAlert();

  // 1. Détection : MetaMask n'est pas disponible
  if (!window.ethereum) {
    showWalletAlert(
      'danger',
      '❌ <strong>MetaMask n\'est pas disponible :</strong> L\'extension MetaMask n\'a pas été détectée dans votre navigateur.<br>Veuillez installer MetaMask depuis le site officiel <a href="https://metamask.io/download/" target="_blank" rel="noopener">metamask.io</a> pour continuer.'
    );
    setWalletStatus('disconnected', 'MetaMask introuvable');
    return;
  }

  try {
    setWalletStatus('disconnected', 'Connexion en cours...');
    // Demander la connexion des comptes
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    await updateWalletState();
  } catch (error) {
    console.error('Erreur connexion MetaMask:', error);

    // 2. Détection : L'utilisateur refuse la connexion
    if (error.code === 4001) {
      showWalletAlert(
        'warning',
        '⚠️ <strong>Connexion refusée :</strong> Vous avez refusé la demande de connexion dans MetaMask.'
      );
      setWalletStatus('disconnected', 'Connexion refusée');
    } else {
      showWalletAlert(
        'danger',
        `❌ <strong>Erreur de connexion :</strong> ${error.message || 'Une erreur est survenue lors de la connexion.'}`
      );
      setWalletStatus('disconnected', 'Erreur');
    }
  }
}

async function switchNetworkToTarget() {
  if (!window.ethereum) return;
  hideWalletAlert();

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: TARGET_CHAIN_ID_HEX }],
    });
    await updateWalletState();
  } catch (switchError) {
    // Si le réseau n'est pas encore enregistré dans MetaMask (code 4902)
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: TARGET_CHAIN_ID_HEX,
              chainName: TARGET_CHAIN_NAME,
              rpcUrls: [TARGET_RPC_URL],
              nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18,
              },
            },
          ],
        });
        await updateWalletState();
      } catch (addError) {
        showWalletAlert(
          'danger',
          `❌ Impossible d'ajouter le réseau Hardhat dans MetaMask : ${addError.message}`
        );
      }
    } else if (switchError.code === 4001) {
      showWalletAlert(
        'warning',
        '⚠️ <strong>Changement de réseau refusé :</strong> Vous avez refusé le changement de réseau dans MetaMask.'
      );
    } else {
      showWalletAlert(
        'danger',
        `❌ Impossible de basculer vers le réseau Hardhat : ${switchError.message}`
      );
    }
  }
}

// Écouteurs d'événements
if (connectWalletBtn) {
  connectWalletBtn.addEventListener('click', connectMetaMask);
}

if (switchNetworkBtn) {
  switchNetworkBtn.addEventListener('click', switchNetworkToTarget);
}

if (window.ethereum) {
  window.ethereum.on('accountsChanged', (accounts) => {
    if (!accounts || accounts.length === 0) {
      connectedAccount = null;
      hideWalletAlert();
      updateWalletState();
    } else {
      updateWalletState();
    }
  });

  window.ethereum.on('chainChanged', () => {
    updateWalletState();
  });

  // Détecter si déjà connecté au chargement de la page
  updateWalletState();
} else {
  setWalletStatus('disconnected', 'Non disponible');
}

// ==========================================
// PARTIE 3 — COMMUNICATION & LECTURE DU SMART CONTRACT
// ==========================================

const CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CONTRACT_ABI = [
  'function registerHash(string patientId, bytes32 hash) public',
  'function getLatestHash(string patientId) public view returns (bytes32)',
  'function verifyHash(string patientId, bytes32 hash) public view returns (bool)',
  'function getVersionCount(string patientId) public view returns (uint256)'
];

const contractStatusBadge = document.getElementById('contractStatusBadge');
const contractStatusText = document.getElementById('contractStatusText');
const contractAlert = document.getElementById('contractAlert');
const contractAddressDisplay = document.getElementById('contractAddressDisplay');
const contractPatientIdDisplay = document.getElementById('contractPatientIdDisplay');
const contractVersionCount = document.getElementById('contractVersionCount');
const contractLatestHash = document.getElementById('contractLatestHash');
const readContractBtn = document.getElementById('readContractBtn');
const testHashInput = document.getElementById('testHashInput');
const verifyHashBtn = document.getElementById('verifyHashBtn');
const fillLatestHashBtn = document.getElementById('fillLatestHashBtn');
const verifyHashResult = document.getElementById('verifyHashResult');
const contractReadLog = document.getElementById('contractReadLog');
const contractLastReadTime = document.getElementById('contractLastReadTime');

let medicalRecordContract = null;
let latestReadHashValue = null;

function appendContractLog(message) {
  if (!contractReadLog) return;
  const time = new Date().toLocaleTimeString('fr-FR');
  const line = `[${time}] ${message}\n`;
  if (
    contractReadLog.textContent.includes('En attente de connexion') ||
    contractReadLog.textContent.includes('Prêt pour la lecture')
  ) {
    contractReadLog.textContent = line;
  } else {
    contractReadLog.textContent += line;
  }
  contractReadLog.scrollTop = contractReadLog.scrollHeight;
  if (contractLastReadTime) {
    contractLastReadTime.textContent = `Dernière lecture : ${time}`;
  }
}

function setContractStatus(status, text) {
  if (!contractStatusBadge || !contractStatusText) return;
  contractStatusBadge.className = `status-badge status-${status}`;
  contractStatusText.textContent = text;
}

function showContractAlert(type, messageHtml) {
  if (!contractAlert) return;
  contractAlert.className = `wallet-alert alert-${type}`;
  contractAlert.innerHTML = messageHtml;
  contractAlert.classList.remove('hidden');
}

function hideContractAlert() {
  if (!contractAlert) return;
  contractAlert.className = 'wallet-alert hidden';
  contractAlert.innerHTML = '';
}

async function getContractInstance() {
  if (!window.ethers) {
    throw new Error('La bibliothèque ethers.js n\'est pas encore disponible.');
  }

  // 1. Si MetaMask est connecté et prêt, utiliser le signer ou le provider du wallet
  if (walletSigner) {
    return new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, walletSigner);
  }
  if (walletProvider) {
    return new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, walletProvider);
  }

  // 2. Fallback direct vers le nœud local Hardhat (opérations de lecture sans MetaMask)
  try {
    const fallbackProvider = new window.ethers.JsonRpcProvider(TARGET_RPC_URL);
    return new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, fallbackProvider);
  } catch (err) {
    throw new Error('Impossible d\'instancier un provider de lecture : ' + err.message);
  }
}

async function readContractData() {
  hideContractAlert();

  if (contractPatientIdDisplay) {
    contractPatientIdDisplay.textContent = patientId ? `Patient #${patientId}` : '-';
  }
  if (contractAddressDisplay) {
    contractAddressDisplay.textContent = CONTRACT_ADDRESS;
  }

  if (!patientId) {
    showContractAlert('warning', 'Identifiant de patient absent.');
    return;
  }

  try {
    setContractStatus('warning', 'Lecture...');
    appendContractLog(`Interrogation du contrat ${CONTRACT_ADDRESS.slice(0, 10)}...`);

    const contract = await getContractInstance();
    medicalRecordContract = contract;

    const onChainPatientId = String(patientId);

    // Opération de lecture 1 : getVersionCount(patientId)
    appendContractLog(`Appel getVersionCount("${onChainPatientId}")...`);
    const versionCount = await contract.getVersionCount(onChainPatientId);
    const countNumber = Number(versionCount);

    if (contractVersionCount) {
      contractVersionCount.textContent = `${countNumber} version(s)`;
    }
    appendContractLog(`=> getVersionCount : ${countNumber} version(s) trouvée(s)`);

    // Opération de lecture 2 : getLatestHash(patientId)
    if (countNumber > 0) {
      appendContractLog(`Appel getLatestHash("${onChainPatientId}")...`);
      const latestHash = await contract.getLatestHash(onChainPatientId);
      latestReadHashValue = latestHash;

      if (contractLatestHash) {
        contractLatestHash.textContent = latestHash;
      }
      appendContractLog(`=> getLatestHash : ${latestHash}`);
    } else {
      latestReadHashValue = null;
      if (contractLatestHash) {
        contractLatestHash.textContent = 'Aucun hash enregistré (0 version sur la blockchain)';
      }
      appendContractLog('=> Aucun hash enregistré sur le smart contract.');
    }

    setContractStatus('connected', 'Connecté & Synchronisé');
    showContractAlert(
      'info',
      `✅ <strong>Lecture réussie :</strong> Communication établie avec le Smart Contract pour le patient <strong>#${patientId}</strong> (${countNumber} version(s) enregistrée(s)).`
    );
    evaluateHashIntegrityStatus();
  } catch (error) {
    console.error('Erreur lecture contrat:', error);
    setContractStatus('disconnected', 'Erreur de lecture');
    appendContractLog(`❌ Erreur: ${error.reason || error.message}`);
    showContractAlert(
      'danger',
      `❌ <strong>Erreur de communication avec le Smart Contract :</strong> ${error.reason || error.message}<br><small>Vérifiez que le nœud local Hardhat tourne sur <code>${TARGET_RPC_URL}</code> et que le contrat est déployé à l'adresse <code>${CONTRACT_ADDRESS}</code>.</small>`
    );
  }
}

async function handleVerifyHash() {
  if (!verifyHashResult) return;
  verifyHashResult.classList.add('hidden');

  const hashToTest = (testHashInput?.value || '').trim();
  if (!hashToTest) {
    verifyHashResult.className = 'wallet-alert alert-warning';
    verifyHashResult.innerHTML = '⚠️ Veuillez saisir un hash <code>bytes32</code> à tester.';
    verifyHashResult.classList.remove('hidden');
    return;
  }

  // Validation du format bytes32 hex
  if (!/^0x[0-9a-fA-F]{64}$/.test(hashToTest)) {
    verifyHashResult.className = 'wallet-alert alert-warning';
    verifyHashResult.innerHTML = '⚠️ Format invalide. Un hash <code>bytes32</code> doit débuter par <code>0x</code> et faire exactement 64 caractères hexadécimaux.';
    verifyHashResult.classList.remove('hidden');
    return;
  }

  try {
    const contract = await getContractInstance();
    const onChainPatientId = String(patientId);

    appendContractLog(`Appel verifyHash("${onChainPatientId}", "${hashToTest.slice(0, 10)}...")...`);

    // Vérifier d'abord s'il existe des versions pour éviter le revert "No medical record found"
    const count = await contract.getVersionCount(onChainPatientId);
    if (Number(count) === 0) {
      verifyHashResult.className = 'wallet-alert alert-warning';
      verifyHashResult.innerHTML = `⚠️ <strong>Aucun enregistrement blockchain :</strong> Le patient #${patientId} n'a aucune version enregistrée sur le smart contract.`;
      verifyHashResult.classList.remove('hidden');
      appendContractLog('=> verifyHash annulé (0 version).');
      return;
    }

    // Opération de lecture 3 : verifyHash(patientId, hash)
    const isMatch = await contract.verifyHash(onChainPatientId, hashToTest);
    appendContractLog(`=> verifyHash(...) résultat : ${isMatch}`);

    if (isMatch) {
      verifyHashResult.className = 'wallet-alert alert-info';
      verifyHashResult.innerHTML = `✅ <strong>Hash Valide & Certifié :</strong> Le hash testé correspond exactement au dernier enregistrement blockchain de ce patient !`;
    } else {
      verifyHashResult.className = 'wallet-alert alert-danger';
      verifyHashResult.innerHTML = `❌ <strong>Hash Non Conforme :</strong> Le hash testé ne correspond pas au dernier enregistrement blockchain.`;
    }
    verifyHashResult.classList.remove('hidden');
  } catch (err) {
    console.error('Erreur verifyHash:', err);
    appendContractLog(`❌ Erreur verifyHash: ${err.reason || err.message}`);
    verifyHashResult.className = 'wallet-alert alert-danger';
    verifyHashResult.innerHTML = `❌ Erreur lors de l'appel <code>verifyHash</code> : ${err.reason || err.message}`;
    verifyHashResult.classList.remove('hidden');
  }
}

// Écouteurs de la Partie 3
if (readContractBtn) {
  readContractBtn.addEventListener('click', () => {
    readContractData();
  });
}

if (verifyHashBtn) {
  verifyHashBtn.addEventListener('click', handleVerifyHash);
}

if (fillLatestHashBtn) {
  fillLatestHashBtn.addEventListener('click', () => {
    if (latestReadHashValue) {
      if (testHashInput) testHashInput.value = latestReadHashValue;
    } else {
      alert("Aucun hash n'a été chargé depuis le smart contract pour ce patient.");
    }
  });
}

// ==========================================
// PARTIE 4 — EMPREINTE CRYPTOGRAPHIQUE DU DOSSIER (BYTES32)
// ==========================================

const hashIntegrityBadge = document.getElementById('hashIntegrityBadge');
const hashIntegrityText = document.getElementById('hashIntegrityText');
const hashCardAlert = document.getElementById('hashCardAlert');
const computedRecordHashEl = document.getElementById('computedRecordHash');
const hashComputedTimestampEl = document.getElementById('hashComputedTimestamp');
const hashElementsCountEl = document.getElementById('hashElementsCount');
const recomputeHashBtn = document.getElementById('recomputeHashBtn');
const verifyCurrentIntegrityBtn = document.getElementById('verifyCurrentIntegrityBtn');
const copyComputedHashBtn = document.getElementById('copyComputedHashBtn');
const toggleSourceDataBtn = document.getElementById('toggleSourceDataBtn');
const sourceDataContainer = document.getElementById('sourceDataContainer');
const canonicalJsonPreview = document.getElementById('canonicalJsonPreview');

let currentComputedRecordHash = null;
let currentCanonicalDossierString = null;

function setHashIntegrityStatus(status, text) {
  if (!hashIntegrityBadge || !hashIntegrityText) return;
  hashIntegrityBadge.className = `status-badge status-${status}`;
  hashIntegrityText.textContent = text;
}

function showHashCardAlert(type, messageHtml) {
  if (!hashCardAlert) return;
  hashCardAlert.className = `wallet-alert alert-${type}`;
  hashCardAlert.innerHTML = messageHtml;
  hashCardAlert.classList.remove('hidden');
}

function hideHashCardAlert() {
  if (!hashCardAlert) return;
  hashCardAlert.className = 'wallet-alert hidden';
  hashCardAlert.innerHTML = '';
}

/**
 * Construit un objet canonique déterministe représentant l'état du dossier.
 * Les champs et identifiants sont triés pour garantir l'invariance et la reproductibilité du hash.
 */
function buildCanonicalDossierObject(dossier) {
  if (!dossier || !dossier.patient) return null;

  return {
    patient: {
      id: Number(dossier.patient.patient_id || patientId),
      name: String(dossier.patient.name || '').trim(),
      email: String(dossier.patient.email || '').trim().toLowerCase(),
      birth_date: String(dossier.patient.birth_date || '').trim(),
      gender: String(dossier.patient.gender || '').trim(),
      blood_type: String(dossier.patient.blood_type || '').trim(),
    },
    consultations: (dossier.consultations || [])
      .map((c) => ({
        id: Number(c.id),
        date: String(c.date || '').trim(),
        reason: String(c.reason || '').trim(),
        notes: String(c.notes || '').trim(),
        doctor_name: String(c.doctor_name || '').trim(),
        diagnostics: (c.diagnostics || [])
          .map((d) => ({
            id: Number(d.id),
            description: String(d.description || '').trim(),
          }))
          .sort((a, b) => a.id - b.id),
        prescriptions: (c.prescriptions || [])
          .map((p) => ({
            id: Number(p.id),
            medication: String(p.medication || '').trim(),
            dosage: String(p.dosage || '').trim(),
            duration: String(p.duration || '').trim(),
            instructions: String(p.instructions || '').trim(),
          }))
          .sort((a, b) => a.id - b.id),
      }))
      .sort((a, b) => a.id - b.id),
  };
}

/**
 * Calcule côté navigateur une empreinte bytes32 (Keccak-256) du dossier médical actuel.
 */
function computeMedicalRecordHash(dossier) {
  hideHashCardAlert();

  const data = dossier || currentDossier;
  if (!data || !data.patient) {
    setHashIntegrityStatus('disconnected', 'Données insuffisantes');
    if (computedRecordHashEl) computedRecordHashEl.textContent = 'En attente des données...';
    return null;
  }

  const canonicalObj = buildCanonicalDossierObject(data);
  const canonicalString = JSON.stringify(canonicalObj);

  currentCanonicalDossierString = canonicalString;

  // Calcul cryptographique Keccak-256 (32 octets / bytes32)
  let hash = null;
  if (window.ethers && window.ethers.keccak256 && window.ethers.toUtf8Bytes) {
    hash = window.ethers.keccak256(window.ethers.toUtf8Bytes(canonicalString));
  } else {
    console.error('ethers.keccak256 indisponible.');
    showHashCardAlert('danger', 'Bibliothèque ethers.js non disponible pour calculer le Keccak-256.');
    return null;
  }

  currentComputedRecordHash = hash;
  window.currentRecordHash = hash;
  window.currentCanonicalDossier = canonicalString;

  // Mise à jour de l'affichage
  if (computedRecordHashEl) {
    computedRecordHashEl.textContent = hash;
    computedRecordHashEl.title = hash;
  }
  if (hashComputedTimestampEl) {
    hashComputedTimestampEl.textContent = `Calculé à ${new Date().toLocaleTimeString('fr-FR')}`;
  }
  if (canonicalJsonPreview) {
    canonicalJsonPreview.textContent = JSON.stringify(canonicalObj, null, 2);
  }

  const consults = data.consultations || [];
  const diagCount = consults.reduce((sum, c) => sum + (c.diagnostics || []).length, 0);
  const prescCount = consults.reduce((sum, c) => sum + (c.prescriptions || []).length, 0);
  if (hashElementsCountEl) {
    hashElementsCountEl.textContent = `${consults.length} consultation(s), ${diagCount} diagnostic(s), ${prescCount} prescription(s)`;
  }

  // Évaluation de la conformité avec la blockchain
  evaluateHashIntegrityStatus();
  updateRegisterPreviews();

  return hash;
}

/**
 * Compare l'empreinte locale calculée avec le dernier hash lu depuis la blockchain.
 */
function evaluateHashIntegrityStatus() {
  if (!currentComputedRecordHash) return;

  if (latestReadHashValue) {
    if (latestReadHashValue.toLowerCase() === currentComputedRecordHash.toLowerCase()) {
      setHashIntegrityStatus('connected', 'Intègre & Certifié');
      showHashCardAlert(
        'info',
        `✅ <strong>Intégrité validée :</strong> L'état actuel du dossier médical correspond exactement au dernier hash enregistré sur la blockchain (<code>${latestReadHashValue.slice(0, 10)}...</code>). Aucune altération détectée.`
      );
    } else {
      setHashIntegrityStatus('warning', 'Modifié / Non synchronisé');
      showHashCardAlert(
        'warning',
        `⚠️ <strong>Empreinte différente :</strong> Le dossier local a évolué ou diffère du dernier ancrage blockchain.<br>• Hash local calculé : <code class="mono">${currentComputedRecordHash.slice(0, 18)}...</code><br>• Dernier hash blockchain : <code class="mono">${latestReadHashValue.slice(0, 18)}...</code><br>Le dossier est prêt à être ancré lors de la prochaine transaction.`
      );
    }
  } else {
    setHashIntegrityStatus('disconnected', 'Empreinte prête');
    showHashCardAlert(
      'info',
      `ℹ️ <strong>Empreinte calculée :</strong> L'empreinte cryptographique <code>bytes32</code> est prête. Aucun enregistrement blockchain n'a encore été effectué pour ce patient.`
    );
  }
}

// Écouteurs de la Partie 4
if (recomputeHashBtn) {
  recomputeHashBtn.addEventListener('click', () => {
    const hash = computeMedicalRecordHash(currentDossier);
    if (hash) {
      appendContractLog(`Empreinte recalculée: ${hash.slice(0, 12)}...`);
    }
  });
}

if (copyComputedHashBtn) {
  copyComputedHashBtn.addEventListener('click', async () => {
    if (!currentComputedRecordHash) {
      alert("Aucune empreinte n'a encore été calculée.");
      return;
    }
    try {
      await navigator.clipboard.writeText(currentComputedRecordHash);
      const originalText = copyComputedHashBtn.textContent;
      copyComputedHashBtn.textContent = '✅ Copié !';
      setTimeout(() => {
        copyComputedHashBtn.textContent = originalText;
      }, 2000);
    } catch {
      alert("Impossible de copier automatiquement dans le presse-papiers.");
    }
  });
}

if (verifyCurrentIntegrityBtn) {
  verifyCurrentIntegrityBtn.addEventListener('click', () => {
    if (!currentComputedRecordHash) {
      alert("Calculez d'abord l'empreinte du dossier.");
      return;
    }
    // Remplir le champ de test de la Partie 3
    if (testHashInput) {
      testHashInput.value = currentComputedRecordHash;
    }
    // Défiler vers la section contrat
    const contractSection = document.getElementById('contractCard');
    if (contractSection) {
      contractSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Lancer la vérification
    handleVerifyHash();
  });
}

if (toggleSourceDataBtn) {
  toggleSourceDataBtn.addEventListener('click', () => {
    if (!sourceDataContainer) return;
    sourceDataContainer.classList.toggle('hidden');
    const isHidden = sourceDataContainer.classList.contains('hidden');
    toggleSourceDataBtn.textContent = isHidden
      ? '👁️ Afficher données sources (JSON)'
      : '🙈 Masquer données sources (JSON)';
  });
}

// ==========================================
// PARTIE 5 — ENREGISTREMENT ON-CHAIN (REGISTERHASH)
// ==========================================

const registerStatusBadge = document.getElementById('registerStatusBadge');
const registerStatusText = document.getElementById('registerStatusText');
const registerAlert = document.getElementById('registerAlert');
const registerPatientIdPreview = document.getElementById('registerPatientIdPreview');
const registerHashPreview = document.getElementById('registerHashPreview');
const registerHashBtn = document.getElementById('registerHashBtn');
const registerHashBtnText = document.getElementById('registerHashBtnText');

const txResultContainer = document.getElementById('txResultContainer');
const txVersionRegistered = document.getElementById('txVersionRegistered');
const txBlockNumber = document.getElementById('txBlockNumber');
const txHashRegistered = document.getElementById('txHashRegistered');
const txTransactionHash = document.getElementById('txTransactionHash');

function setRegisterStatus(status, text) {
  if (!registerStatusBadge || !registerStatusText) return;
  registerStatusBadge.className = `status-badge status-${status}`;
  registerStatusText.textContent = text;
}

function showRegisterAlert(type, messageHtml) {
  if (!registerAlert) return;
  registerAlert.className = `wallet-alert alert-${type}`;
  registerAlert.innerHTML = messageHtml;
  registerAlert.classList.remove('hidden');
}

function hideRegisterAlert() {
  if (!registerAlert) return;
  registerAlert.className = 'wallet-alert hidden';
  registerAlert.innerHTML = '';
}

function updateRegisterPreviews() {
  if (registerPatientIdPreview) {
    registerPatientIdPreview.textContent = patientId ? `Patient #${patientId}` : '-';
  }
  if (registerHashPreview) {
    registerHashPreview.textContent = currentComputedRecordHash || 'Empreinte non calculée';
  }
}

async function registerHashOnBlockchain() {
  hideRegisterAlert();

  // 1. Vérification : MetaMask disponible ?
  if (!window.ethereum) {
    showRegisterAlert(
      'danger',
      '❌ <strong>MetaMask n\'est pas disponible :</strong> L\'extension MetaMask est requise pour signer et envoyer des transactions sur la blockchain.'
    );
    return;
  }

  // 2. Vérification : Portefeuille connecté ?
  if (!connectedAccount || !walletSigner) {
    showRegisterAlert(
      'warning',
      '⚠️ <strong>Portefeuille non connecté :</strong> Veuillez d\'abord connecter votre portefeuille MetaMask (Partie 2).'
    );
    document.getElementById('walletCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // 3. Vérification : Réseau adéquat (Hardhat Local 31337) ?
  try {
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);
    if (chainId !== TARGET_CHAIN_ID && chainId !== 1337) {
      showRegisterAlert(
        'warning',
        `⚠️ <strong>Mauvais réseau :</strong> Vous êtes sur le réseau avec Chain ID <strong>${chainId}</strong>. Veuillez basculer vers <strong>${TARGET_CHAIN_NAME}</strong> (Chain ID: <strong>${TARGET_CHAIN_ID}</strong>).`
      );
      document.getElementById('walletCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  } catch (err) {
    console.warn('Erreur vérification chainId:', err);
  }

  // 4. Vérification de l'empreinte calculée
  let hashToRegister = currentComputedRecordHash;
  if (!hashToRegister) {
    hashToRegister = computeMedicalRecordHash(currentDossier);
  }
  if (!hashToRegister) {
    showRegisterAlert(
      'danger',
      '❌ <strong>Erreur :</strong> Impossible de calculer l\'empreinte du dossier médical.'
    );
    return;
  }

  const onChainPatientId = String(patientId);

  try {
    // État UI : En attente de signature
    setRegisterStatus('warning', 'Signature demandée');
    if (registerHashBtn) registerHashBtn.disabled = true;
    if (registerHashBtnText) registerHashBtnText.textContent = '⏳ En attente de confirmation dans MetaMask...';
    showRegisterAlert(
      'info',
      '⏳ <strong>Confirmation demandée :</strong> Veuillez confirmer la transaction dans votre extension MetaMask...'
    );

    appendContractLog(`Préparation de la transaction registerHash("${onChainPatientId}", "${hashToRegister.slice(0, 10)}...")...`);

    // Instanciation du contrat avec le Signer MetaMask
    const contractWithSigner = new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, walletSigner);

    // Envoi de la transaction
    const tx = await contractWithSigner.registerHash(onChainPatientId, hashToRegister);

    // État UI : Transaction diffusée, attente du minage
    setRegisterStatus('warning', 'Minage en cours...');
    if (registerHashBtnText) registerHashBtnText.textContent = '⏳ Transaction envoyée... Minage du bloc...';
    showRegisterAlert(
      'info',
      `⏳ <strong>Transaction envoyée :</strong> Hash de transaction : <code class="mono">${tx.hash}</code><br>Attente de confirmation et de minage dans le prochain bloc...`
    );
    appendContractLog(`=> Tx envoyée : ${tx.hash}. Attente de minage...`);

    // Attendre la confirmation (minage du bloc)
    const receipt = await tx.wait();
    appendContractLog(`=> Tx minée dans le bloc #${receipt.blockNumber} (Gas utilisé: ${receipt.gasUsed?.toString() || 'N/A'})`);

    // Récupérer le numéro de version enregistré (via event ou getVersionCount)
    let versionRegistered = null;
    if (receipt.logs && receipt.logs.length > 0) {
      for (const log of receipt.logs) {
        try {
          const parsed = contractWithSigner.interface.parseLog(log);
          if (parsed && parsed.name === 'RecordHashRegistered') {
            versionRegistered = Number(parsed.args.version);
            break;
          }
        } catch {}
      }
    }
    if (versionRegistered === null) {
      const count = await contractWithSigner.getVersionCount(onChainPatientId);
      versionRegistered = Number(count);
    }

    // Afficher les informations requises :
    // ● le hash enregistré
    // ● le numéro de version enregistré
    if (txVersionRegistered) txVersionRegistered.textContent = `Version #${versionRegistered}`;
    if (txHashRegistered) txHashRegistered.textContent = hashToRegister;
    if (txTransactionHash) txTransactionHash.textContent = tx.hash;
    if (txBlockNumber) txBlockNumber.textContent = `#${receipt.blockNumber}`;

    if (txResultContainer) txResultContainer.classList.remove('hidden');

    setRegisterStatus('connected', `Version #${versionRegistered} enregistrée`);
    showRegisterAlert(
      'info',
      `🎉 <strong>Succès :</strong> L'empreinte <code>bytes32</code> a été enregistrée avec succès sur la blockchain !<br>• Version : <strong>#${versionRegistered}</strong><br>• Transaction : <code class="mono">${tx.hash}</code>`
    );

    appendContractLog(`✅ Empreinte certifiée sur la blockchain : Patient #${onChainPatientId}, Version #${versionRegistered}`);

    // Synchronisation automatique de la Partie 3 et de la Partie 4
    await readContractData();
    evaluateHashIntegrityStatus();

  } catch (error) {
    console.error('Erreur registerHash:', error);

    // Détection de l'annulation par l'utilisateur
    if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
      setRegisterStatus('disconnected', 'Transaction rejetée');
      showRegisterAlert(
        'warning',
        '⚠️ <strong>Transaction refusée :</strong> Vous avez rejeté la signature de la transaction dans MetaMask.'
      );
      appendContractLog('❌ Signature de la transaction refusée par l\'utilisateur.');
    } else {
      setRegisterStatus('disconnected', 'Erreur transaction');
      showRegisterAlert(
        'danger',
        `❌ <strong>Erreur de transaction :</strong> ${error.reason || error.message}`
      );
      appendContractLog(`❌ Erreur transaction: ${error.reason || error.message}`);
    }
  } finally {
    if (registerHashBtn) registerHashBtn.disabled = false;
    if (registerHashBtnText) registerHashBtnText.textContent = 'Enregistrer l\'empreinte sur la Blockchain (registerHash)';
  }
}

if (registerHashBtn) {
  registerHashBtn.addEventListener('click', registerHashOnBlockchain);
}

// ==========================================
// PARTIE 6 — AUDIT D'INTÉGRITÉ & DÉTECTION DES MODIFICATIONS
// ==========================================

const auditStatusBadge = document.getElementById('auditStatusBadge');
const auditStatusText = document.getElementById('auditStatusText');
const auditAlert = document.getElementById('auditAlert');
const runAuditBtn = document.getElementById('runAuditBtn');
const auditLastTimestamp = document.getElementById('auditLastTimestamp');
const auditLocalHash = document.getElementById('auditLocalHash');
const auditLocalHashStatus = document.getElementById('auditLocalHashStatus');
const auditChainHash = document.getElementById('auditChainHash');
const auditChainHashStatus = document.getElementById('auditChainHashStatus');
const auditMatchResult = document.getElementById('auditMatchResult');
const auditContractVerifyResult = document.getElementById('auditContractVerifyResult');
const auditVerdict = document.getElementById('auditVerdict');

function setAuditStatus(status, text) {
  if (!auditStatusBadge || !auditStatusText) return;
  auditStatusBadge.className = `status-badge status-${status}`;
  auditStatusText.textContent = text;
}

function showAuditAlert(type, messageHtml) {
  if (!auditAlert) return;
  auditAlert.className = `wallet-alert alert-${type}`;
  auditAlert.innerHTML = messageHtml;
  auditAlert.classList.remove('hidden');
}

function hideAuditAlert() {
  if (!auditAlert) return;
  auditAlert.className = 'wallet-alert hidden';
  auditAlert.innerHTML = '';
}

/**
 * Recalcule l'empreinte actuelle du dossier et la compare avec la blockchain
 * pour détecter toute modification ou altération.
 */
async function runIntegrityAudit() {
  hideAuditAlert();
  setAuditStatus('warning', 'Audit en cours...');

  if (runAuditBtn) runAuditBtn.disabled = true;

  try {
    const time = new Date().toLocaleTimeString('fr-FR');
    if (auditLastTimestamp) {
      auditLastTimestamp.textContent = `Dernier audit : ${time}`;
    }

    appendContractLog(`Lancement de l'audit d'intégrité (Partie 6)...`);

    // 1. Étape 1 : Obtenir les données actuelles fraîches du dossier
    let dossierData = currentDossier;
    try {
      dossierData = await apiFetch(`/api/doctor/patients/${patientId}/dossier`);
      currentDossier = dossierData;
    } catch (e) {
      console.warn('Utilisation du dossier en mémoire:', e);
    }

    // 2. Étape 2 : Recalculer l'empreinte côté navigateur
    const recalculatedHash = computeMedicalRecordHash(dossierData);
    if (!recalculatedHash) {
      setAuditStatus('disconnected', 'Erreur de calcul');
      showAuditAlert('danger', 'Impossible de recalculer l\'empreinte du dossier médical.');
      return;
    }

    if (auditLocalHash) {
      auditLocalHash.textContent = recalculatedHash;
    }
    if (auditLocalHashStatus) {
      auditLocalHashStatus.textContent = 'Recalculé avec succès';
      auditLocalHashStatus.style.color = '#10b981';
    }

    // 3. Étape 3 : Récupérer l'empreinte certifiée sur la blockchain
    const contract = await getContractInstance();
    const onChainPatientId = String(patientId);

    const versionCount = Number(await contract.getVersionCount(onChainPatientId));

    if (versionCount === 0) {
      // Cas : Aucun enregistrement antérieur
      if (auditChainHash) {
        auditChainHash.textContent = 'Aucun hash enregistré (0 version sur la blockchain)';
      }
      if (auditChainHashStatus) {
        auditChainHashStatus.textContent = '0 version on-chain';
        auditChainHashStatus.style.color = '#64748b';
      }
      if (auditMatchResult) auditMatchResult.textContent = 'Non comparable (0 version)';
      if (auditContractVerifyResult) auditContractVerifyResult.textContent = 'Non applicable';
      if (auditVerdict) {
        auditVerdict.innerHTML = '<span style="color:#64748b; font-weight:700;">⚪ Non Ancré</span>';
      }

      setAuditStatus('disconnected', 'Non ancré');
      showAuditAlert(
        'info',
        `ℹ️ <strong>Aucun ancrage antérieur :</strong> Le dossier médical du patient #${patientId} n'a encore jamais été certifié sur la blockchain (0 version). Utilisez la <strong>Partie 5</strong> ci-dessus pour réaliser le premier enregistrement.`
      );
      appendContractLog(`=> Audit : 0 version sur la blockchain.`);
      return;
    }

    // Récupérer le dernier hash enregistré
    const onChainLatestHash = await contract.getLatestHash(onChainPatientId);
    latestReadHashValue = onChainLatestHash;

    if (auditChainHash) {
      auditChainHash.textContent = onChainLatestHash;
    }
    if (auditChainHashStatus) {
      auditChainHashStatus.textContent = `Version #${versionCount}`;
      auditChainHashStatus.style.color = '#2563eb';
    }

    // 4. Étape 4 : Comparaison bit-à-bit des deux empreintes
    const isExactMatch = (recalculatedHash.toLowerCase() === onChainLatestHash.toLowerCase());

    // Vérification contractuelle supplémentaire via verifyHash
    let contractVerifyBool = false;
    try {
      contractVerifyBool = await contract.verifyHash(onChainPatientId, recalculatedHash);
    } catch (err) {
      console.warn('verifyHash call error:', err);
    }

    if (auditMatchResult) {
      auditMatchResult.innerHTML = isExactMatch
        ? '<span style="color:#15803d; font-weight:700;">✅ Hashs Identiques</span>'
        : '<span style="color:#b91c1c; font-weight:700;">❌ Hashs Différents</span>';
    }

    if (auditContractVerifyResult) {
      auditContractVerifyResult.innerHTML = contractVerifyBool
        ? '<span style="color:#15803d; font-weight:700;">true (Contrat valide)</span>'
        : '<span style="color:#b91c1c; font-weight:700;">false (Contrat invalide)</span>';
    }

    // 5. Étape 5 : Diagnostic et Détection de modification
    if (isExactMatch && contractVerifyBool) {
      // Cas A : Dossier intègre (aucune modification)
      setAuditStatus('connected', 'Dossier Intègre (Aucune modification)');
      if (auditVerdict) {
        auditVerdict.innerHTML = '<span style="color:#15803d; font-weight:700;">🟢 Intègre & Conforme</span>';
      }
      showAuditAlert(
        'info',
        `✅ <strong>Intégrité validée — Aucune modification :</strong> L'empreinte recalculée du dossier local correspond exactement à l'empreinte scellée sur la blockchain dans la <strong>version #${versionCount}</strong>. L'authenticité du dossier médical est confirmée.`
      );
      appendContractLog(`=> Audit : Dossier INTÈGRE (conforme à la v#${versionCount}).`);
    } else {
      // Cas B : Modification détectée (dossier altéré ou enrichi)
      setAuditStatus('warning', 'Modification Détectée !');
      if (auditVerdict) {
        auditVerdict.innerHTML = '<span style="color:#dc2626; font-weight:700;">🔴 Modification Détectée</span>';
      }
      showAuditAlert(
        'warning',
        `⚠️ <strong>Modification détectée dans le dossier médical !</strong><br>
         L'état actuel du dossier ne correspond plus à l'empreinte scellée sur la blockchain lors de la <strong>version #${versionCount}</strong>.<br>
         <ul style="margin: 6px 0 0 16px; padding: 0;">
           <li>Des informations (consultation, prescription ou diagnostic) ont été ajoutées ou modifiées depuis le dernier ancrage.</li>
           <li>Pour certifier cet état actualisé, cliquez sur <strong>Enregistrer l'empreinte (registerHash)</strong> dans la Partie 5 ci-dessus.</li>
         </ul>`
      );
      appendContractLog(`=> Audit : MODIFICATION DÉTECTÉE ! Hash local != Hash on-chain (v#${versionCount}).`);
    }

  } catch (error) {
    console.error('Erreur audit d\'intégrité:', error);
    setAuditStatus('disconnected', 'Erreur audit');
    showAuditAlert(
      'danger',
      `❌ <strong>Erreur lors de l'audit d'intégrité :</strong> ${error.reason || error.message}`
    );
    appendContractLog(`❌ Erreur audit: ${error.reason || error.message}`);
  } finally {
    if (runAuditBtn) runAuditBtn.disabled = false;
  }
}

if (runAuditBtn) {
  runAuditBtn.addEventListener('click', runIntegrityAudit);
}





