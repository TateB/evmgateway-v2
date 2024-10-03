// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IVerifierHooks, InvalidProof, NOT_A_CONTRACT, NULL_CODE_HASH} from '../IVerifierHooks.sol';

interface IPoseidon {
    function poseidon(
        uint256[2] memory,
        uint256
    ) external view returns (bytes32);
}

//import "forge-std/console2.sol";

contract ScrollVerifierHooks is IVerifierHooks {
    IPoseidon immutable _poseidon;
    constructor(IPoseidon poseidon) {
        _poseidon = poseidon;
    }

    // https://github.com/scroll-tech/scroll/blob/738c85759d0248c005469972a49fc983b031ff1c/contracts/src/libraries/verifier/ZkTrieVerifier.sol#L259
    // https://github.com/scroll-tech/go-ethereum/blob/staging/trie/zk_trie.go#L176
    // https://github.com/scroll-tech/zktrie/blob/main/trie/zk_trie_proof.go#L30
    // https://github.com/ethereum/go-ethereum/blob/master/trie/proof.go#L114
    // https://github.com/scroll-tech/mpt-circuit/blob/v0.7/spec/mpt-proof.md#storage-segmenttypes

    // 20240622
    // we no longer care (verify or require) about the magic bytes, as it doesn't do anything
    // https://github.com/scroll-tech/zktrie/blob/23181f209e94137f74337b150179aeb80c72e7c8/trie/zk_trie_proof.go#L13
    // bytes32 constant MAGIC = keccak256("THIS IS SOME MAGIC BYTES FOR SMT m1rRXgP2xpDI");

    // https://github.com/scroll-tech/zktrie/blob/23181f209e94137f74337b150179aeb80c72e7c8/trie/zk_trie_node.go#L30
    uint256 constant NODE_LEAF = 4;
    uint256 constant NODE_LEAF_EMPTY = 5;
    uint256 constant NODE_LEAF_LEAF = 6; // XX
    uint256 constant NODE_LEAF_BRANCH = 7; // XB
    uint256 constant NODE_BRANCH_LEAF = 8; // BX
    uint256 constant NODE_BRANCH_BRANCH = 9; // BB

    // 20240918: 900k gas
    function verifyAccountState(
        bytes32 stateRoot,
        address account,
        bytes memory encodedProof
    ) external view returns (bytes32 storageRoot) {
        bytes[] memory proof = abi.decode(encodedProof, (bytes[]));
        //bytes32 raw = bytes32(bytes20(account));
        bytes32 key = poseidonHash1(bytes20(account)); // left aligned
        (bytes32 leafHash, bytes memory leaf) = walkTree(key, proof, stateRoot);
        // HOW DO I TELL THIS DOESNT EXIST?
        if (!isValidLeaf(leaf, 230, bytes32(bytes20(account)), key, 0x05080000))
            revert InvalidProof();
        // REUSING VARIABLE #1
        bytes32 temp;
        assembly {
            temp := mload(add(leaf, 69))
        } // nonce||codesize||0
        // REUSING VARIABLE #2
        assembly {
            stateRoot := mload(add(leaf, 101))
        } // balance
        assembly {
            storageRoot := mload(add(leaf, 133))
        }
        bytes32 codeHash;
        assembly {
            codeHash := mload(add(leaf, 165))
        }
        bytes32 h = poseidonHash2(storageRoot, poseidonHash1(codeHash), 1280);
        h = poseidonHash2(poseidonHash2(temp, stateRoot, 1280), h, 1280);
        // REUSING VARIABLE #3
        assembly {
            temp := mload(add(leaf, 197))
        }
        h = poseidonHash2(h, temp, 1280);
        h = poseidonHash2(key, h, 4);
        if (leafHash != h) revert InvalidProof(); // InvalidAccountLeafNodeHash
        if (codeHash == NULL_CODE_HASH) storageRoot = NOT_A_CONTRACT;
    }

    // 20240918: 93k gas
    function verifyStorageValue(
        bytes32 storageRoot,
        address /*target*/,
        uint256 slot,
        bytes memory encodedProof
    ) external view returns (bytes32 value) {
        bytes[] memory proof = abi.decode(encodedProof, (bytes[]));
        bytes32 key = poseidonHash1(bytes32(slot));
        (bytes32 leafHash, bytes memory leaf) = walkTree(
            key,
            proof,
            storageRoot
        );
        uint256 nodeType = uint8(leaf[0]);
        if (nodeType == NODE_LEAF) {
            if (!isValidLeaf(leaf, 102, bytes32(slot), key, 0x01010000))
                revert InvalidProof();
            assembly {
                value := mload(add(leaf, 69))
            }
            bytes32 h = poseidonHash2(key, poseidonHash1(value), 4);
            if (leafHash != h) revert InvalidProof(); // InvalidStorageLeafNodeHash
        } else if (nodeType == NODE_LEAF_EMPTY) {
            if (leaf.length != 1) revert InvalidProof();
            if (leafHash != 0) revert InvalidProof(); // InvalidStorageEmptyLeafNodeHash
        }
    }

    function isValidLeaf(
        bytes memory leaf,
        uint256 len,
        bytes32 raw,
        bytes32 key,
        bytes4 flag
    ) internal pure returns (bool) {
        if (leaf.length != len) return false;
        bytes32 temp;
        assembly {
            temp := mload(add(leaf, 33))
        }
        if (temp != key) return false; // KeyMismatch
        assembly {
            temp := mload(add(leaf, 65))
        }
        if (bytes4(temp) != flag) return false; // InvalidCompressedFlag
        if (uint8(leaf[len - 33]) != 32) return false; // InvalidKeyPreimageLength
        assembly {
            temp := mload(add(leaf, len))
        }
        return temp == raw; // InvalidKeyPreimage
    }

    function walkTree(
        bytes32 key,
        bytes[] memory proof,
        bytes32 rootHash
    ) internal view returns (bytes32 expectedHash, bytes memory v) {
        expectedHash = rootHash;
        bool done;
        //console2.log("[WALK PROOF] %s", proof.length);
        for (uint256 i; ; i++) {
            if (i == proof.length) revert InvalidProof();
            v = proof[i];
            bool left = uint256(key >> i) & 1 == 0;
            uint256 nodeType = uint8(v[0]);
            //console2.log("[%s] %s %s", i, nodeType, left ? "L" : "R");
            if (nodeType == NODE_LEAF) {
                // 20240917: tate noted 1 slot trie is just a terminal node
                if (done || i == 0) break;
                revert InvalidProof(); // expected leaf
            } else if (
                nodeType < NODE_LEAF_LEAF ||
                nodeType > NODE_BRANCH_BRANCH ||
                v.length != 65
            ) {
                revert InvalidProof(); // expected node
            }
            bytes32 l;
            bytes32 r;
            assembly {
                l := mload(add(v, 33))
                r := mload(add(v, 65))
            }
            bytes32 h = poseidonHash2(l, r, nodeType);
            if (h != expectedHash) revert InvalidProof();
            expectedHash = left ? l : r;
            if (
                nodeType == NODE_LEAF_LEAF ||
                (
                    left
                        ? nodeType == NODE_LEAF_BRANCH
                        : nodeType == NODE_BRANCH_LEAF
                )
            ) {
                //console2.log("done = true");
                done = true;
            }
        }
    }

    function poseidonHash1(bytes32 x) internal view returns (bytes32) {
        return poseidonHash2(x >> 128, (x << 128) >> 128, 512);
    }
    function poseidonHash2(
        bytes32 v0,
        bytes32 v1,
        uint256 domain
    ) internal view returns (bytes32) {
        //uint256 g = gasleft();
        return _poseidon.poseidon([uint256(v0), uint256(v1)], domain);
        //console2.log("hash: %s", g - gasleft());
        /*
		// try POSEIDON.poseidon([uint256(v0), uint256(v1)], domain) returns (bytes32 h) {
		// 	return h;
		// } catch {
		// 	revert InvalidProof();
		// }
		bool success;
		assembly {
			let x := mload(0x40)
			// keccak256("poseidon(uint256[2],uint256)")
			mstore(x, 0xa717016c00000000000000000000000000000000000000000000000000000000)
			mstore(add(x, 0x04), v0)
			mstore(add(x, 0x24), v1)
			mstore(add(x, 0x44), domain)
			success := staticcall(gas(), _poseidon, x, 0x64, 0x20, 0x20)
			r := mload(0x20)
		}
		if (!success) revert InvalidProof();
		*/
    }
}
