// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MedicalRecord {

    struct RecordVersion {
        bytes32 hash;
        uint256 timestamp;
    }

    mapping(string => RecordVersion[]) private records;

    event RecordHashRegistered(
        string indexed patientId,
        uint256 version,
        bytes32 hash,
        uint256 timestamp
    );

    function registerHash(
        string memory patientId,
        bytes32 hash
    ) public {
        records[patientId].push(
            RecordVersion({
                hash: hash,
                timestamp: block.timestamp
            })
        );

        emit RecordHashRegistered(
            patientId,
            records[patientId].length,
            hash,
            block.timestamp
        );
    }

    function getLatestHash(
        string memory patientId
    ) public view returns (bytes32) {
        require(
            records[patientId].length > 0,
            "No medical record found"
        );

        return records[patientId][records[patientId].length - 1].hash;
    }

    function verifyHash(
        string memory patientId,
        bytes32 hash
    ) public view returns (bool) {
        require(
            records[patientId].length > 0,
            "No medical record found"
        );

        return records[patientId][records[patientId].length - 1].hash == hash;
    }

    function getVersionCount(
        string memory patientId
    ) public view returns (uint256) {
        return records[patientId].length;
    }
}