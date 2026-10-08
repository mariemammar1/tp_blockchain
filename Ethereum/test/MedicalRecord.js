import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("MedicalRecord", function () {
    let medicalRecord;
)
    const hash2 =
        "0x2222222222222222222222222222222222222222222222222222222222222222";

    const wrongHash =
        "0x9999999999999999999999999999999999999999999999999999999999999999";

    beforeEach(async function () {
        const MedicalRecord =
            await ethers.getContractFactory("MedicalRecord");

        medicalRecord = await MedicalRecord.deploy();

        await medicalRecord.waitForDeployment();
    });

    it("should register a hash", async function () {
        await medicalRecord.registerHash(patientId, hash1);

        const latestHash =
            await medicalRecord.getLatestHash(patientId);

        expect(latestHash).to.equal(hash1);
    });

    it("should return the latest hash", async function () {
        await medicalRecord.registerHash(patientId, hash1);
        await medicalRecord.registerHash(patientId, hash2);

        const latestHash =
            await medicalRecord.getLatestHash(patientId);

        expect(latestHash).to.equal(hash2);
    });

    it("should verify a correct hash", async function () {
        await medicalRecord.registerHash(patientId, hash1);

        const result =
            await medicalRecord.verifyHash(patientId, hash1);

        expect(result).to.equal(true);
    });

    it("should reject an incorrect hash", async function () {
        await medicalRecord.registerHash(patientId, hash1);

        const result =
            await medicalRecord.verifyHash(patientId, wrongHash);

        expect(result).to.equal(false);
    });

    it("should reject a patient without a record", async function () {
        await expect(
            medicalRecord.getLatestHash("P999")
        ).to.be.revertedWith("No medical record found");
    });

    it("should handle multiple versions", async function () {
        await medicalRecord.registerHash(patientId, hash1);
        await medicalRecord.registerHash(patientId, hash2);

        const count =
            await medicalRecord.getVersionCount(patientId);

        expect(count).to.equal(2n);

        const latestHash =
            await medicalRecord.getLatestHash(patientId);

        expect(latestHash).to.equal(hash2);
    });

    it("should emit RecordHashRegistered event", async function () {
        const tx = await medicalRecord.registerHash(
            patientId,
            hash1
        );

        const receipt = await tx.wait();

        expect(receipt.logs.length).to.be.greaterThan(0);
    });
});