import { ethers } from "ethers";
import "./style.css";

// Adresse de notre contrat MedicalRecord
const CONTRACT_ADDRESS =
  "0x5fbdb2315678afecb367f032d93f642f64180aa3";

// ABI des fonctions que nous allons utiliser
const CONTRACT_ABI = [
  "function registerHash(string patientId, bytes32 hash) public",
  "function getLatestHash(string patientId) public view returns (bytes32)",
  "function verifyHash(string patientId, bytes32 hash) public view returns (bool)",
  "function getVersionCount(string patientId) public view returns (uint256)"
];

// Éléments HTML
const connectButton =
  document.querySelector("#connectButton");

const accountElement =
  document.querySelector("#account");

const networkElement =
  document.querySelector("#network");

const registerButton =
  document.querySelector("#registerButton");

const transactionStatus =
  document.querySelector("#transactionStatus");

// Provider et contrat
let provider;
let signer;
let contract;


// ==========================================
// CONNEXION À METAMASK
// ==========================================

connectButton.addEventListener("click", async () => {

  try {

    if (!window.ethereum) {
      throw new Error(
        "MetaMask n'est pas installé."
      );
    }

    // Demander la connexion
    await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    // Connexion à MetaMask
    provider =
      new ethers.BrowserProvider(
        window.ethereum
      );

    // Récupérer le compte
    signer =
      await provider.getSigner();

    const address =
      await signer.getAddress();

    // Récupérer le réseau
    const network =
      await provider.getNetwork();

    // Afficher les informations
    accountElement.textContent =
      address;

    networkElement.textContent =
      `Chain ID: ${network.chainId}`;

    // Connexion au contrat
    contract =
      new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );

    console.log(
      "Contrat connecté :",
      CONTRACT_ADDRESS
    );

  } catch (error) {

    console.error(error);

    accountElement.textContent =
      "Erreur de connexion";

  }
});


// ==========================================
// ENREGISTRER UN HASH
// ==========================================

registerButton.addEventListener(
  "click",
  async () => {

    try {

      // Vérifier que MetaMask est connecté
      if (!contract) {
        alert(
          "Connecte d'abord MetaMask."
        );
        return;
      }

      // Récupérer les valeurs
      const patientId =
        document.querySelector(
          "#patientId"
        ).value;

      const medicalData =
        document.querySelector(
          "#medicalData"
        ).value;

      // Vérifications
      if (!patientId || !medicalData) {

        alert(
          "Remplis tous les champs."
        );

        return;
      }

      // Transformer les données médicales
      // en hash bytes32
      const hash =
        ethers.keccak256(
          ethers.toUtf8Bytes(
            medicalData
          )
        );

      console.log(
        "Patient ID :",
        patientId
      );

      console.log(
        "Hash :",
        hash
      );

      transactionStatus.textContent =
        "⏳ En attente de confirmation dans MetaMask...";

      // Appel de la fonction Solidity
      const transaction =
        await contract.registerHash(
          patientId,
          hash
        );

      console.log(
        "Transaction envoyée :",
        transaction.hash
      );

      transactionStatus.textContent =
        "⏳ Transaction envoyée. Attente de confirmation...";

      // Attendre le minage
      const receipt =
        await transaction.wait();

      console.log(
        "Transaction confirmée :",
        receipt
      );

      transactionStatus.textContent =
        `✅ Transaction confirmée ! Hash : ${transaction.hash}`;

    } catch (error) {

      console.error(error);

      transactionStatus.textContent =
        `❌ Erreur : ${error.message}`;
    }
  }
);