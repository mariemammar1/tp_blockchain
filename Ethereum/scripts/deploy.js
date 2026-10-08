import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() {
    console.log("Deploying MedicalRecord...");

    const MedicalRecord =
        await ethers.getContractFactory("MedicalRecord");

    const medicalRecord =
        await MedicalRecord.deploy();

    await medicalRecord.waitForDeployment();

    const address =
        await medicalRecord.getAddress();

    console.log(
        "MedicalRecord deployed to:",
        address
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
