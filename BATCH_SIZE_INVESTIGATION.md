# mintBatch バッチサイズ上限調査結果

## 調査日時
2025年（調査実施時点）

## 調査環境
- Hardhat ローカルネットワーク
- Block Gas Limit: 100,000,000 (100M) ※テスト用に増加
- Solidity バージョン: 0.8.17
- Optimizer: 有効 (runs: 200)

## 結果サマリー

**最大バッチサイズ: 48件**

49件以上でトランザクションがリバートします。

## 詳細データ

### 標準テストデータ

| バッチサイズ | ガス使用量 | ステータス |
|------------|-----------|-----------|
| 10件 | 3,525,263 | ✅ 成功 |
| 20件 | 6,887,838 | ✅ 成功 |
| 30件 | 10,250,772 | ✅ 成功 |
| 40件 | 13,614,076 | ✅ 成功 |
| 42件 | 14,286,789 | ✅ 成功 |
| 45件 | 15,296,017 | ✅ 成功 |
| 48件 | 16,304,992 | ✅ 成功 |
| 49件 | - | ❌ 失敗 |
| 50件 | - | ❌ 失敗 |

### 現実的なデータサイズでのテスト

**テストパラメータ:**
- tokenId: 10桁（例: 1234567890）
- receiptId: 10桁（例: 1000000001）
- saleAmount: 5桁（例: 12345 ETH/MATIC）
- invoiceId: 16文字（例: "INV0000000000001"）

| バッチサイズ | ガス使用量 | 差分 | ステータス |
|------------|-----------|------|-----------|
| 20件 | 6,889,638 | +1,800 (+0.03%) | ✅ 成功 |
| 30件 | 10,253,412 | +2,640 (+0.03%) | ✅ 成功 |
| 40件 | 13,617,556 | +3,480 (+0.03%) | ✅ 成功 |
| 48件 | 16,309,144 | +3,792 (+0.02%) | ✅ 成功 |
| 49件 | - | - | ❌ 失敗 |

**結論:** invoiceIdの長さ（16文字）やsaleAmountの大きさ（5桁）は、バッチサイズの上限には影響しません。ガス使用量の増加は0.03%未満で無視できるレベルです。

## ガス消費パターン

- 1件あたり平均: 約 340,000 ガス
- 線形に近い増加パターン

## 失敗の原因分析

48件を超えるとトランザクションがリバートする原因として考えられるもの:

### 1. メモリ/コールデータサイズの制限
各mintBatchの呼び出しには以下の配列データが含まれます:
- `receiptIds[]` - uint256配列
- `tokenIds[]` - uint256配列
- `customers[]` - address配列
- `saleAmounts[]` - uint256配列
- `paymentInvoiceIds[]` - string配列

49件以上になると、これらの配列の合計サイズがEVMの制限に達する可能性があります。

### 2. ストレージ書き込みの累積
各ミントで以下のストレージ操作が発生:
- `receipts[receiptId]` の書き込み（MintReceipt構造体）
- `tokenIdToReceipts[tokenId].push(receiptId)`
- `customerToReceipts[customer].push(receiptId)`
- ERC1155の`_mint()`によるバランス更新

MintReceipt構造体は動的配列（recipients, shares）を含むため、大量の書き込みが発生します。

### 3. EVMのスタック深度制限
内部的に複数の関数呼び出しが発生するため、スタック深度の制限に達する可能性があります。

## 実運用における推奨事項

### 推奨バッチサイズ: **30-40件**

理由:
1. **安全マージンの確保**: 上限48件に対して余裕を持たせる
2. **ガス効率**: Polygonのブロックガスリミット（約30M）を考慮
3. **ネットワーク環境の違い**: メインネット環境では制約がより厳しい場合がある

### ガスコスト見積もり（Polygon想定）

| バッチサイズ | 推定ガス使用量 | MATIC価格$1の場合のコスト |
|------------|--------------|------------------------|
| 10件 | 3,500,000 | 約 $0.0035 @ 1 Gwei |
| 20件 | 7,000,000 | 約 $0.007 @ 1 Gwei |
| 30件 | 10,500,000 | 約 $0.0105 @ 1 Gwei |
| 40件 | 14,000,000 | 約 $0.014 @ 1 Gwei |

## 実装上の注意点

1. **エラーハンドリング**
   - バッチサイズが大きい場合は、失敗時に小さいバッチに分割して再試行する仕組みを検討

2. **進捗管理**
   - 大量のミントが必要な場合は、複数のバッチに分割してサーバー側で管理

3. **モニタリング**
   - バッチサイズとガス使用量の相関を本番環境でもモニタリング

## テストコード例

### 基本的なバッチサイズテスト

```typescript
const testBatchSize = async (batchSize: number, useRealisticData = false) => {
    const receiptIds = Array.from({ length: batchSize }, () => getNextReceiptId())
    const tokenIds = Array(batchSize).fill(tokenId)
    const customers = Array(batchSize).fill(customer1.address)

    // 現実的なデータサイズを使用する場合
    const saleAmounts = useRealisticData
        ? Array(batchSize).fill(ethers.parseEther("12345")) // 5桁
        : Array(batchSize).fill(ethers.parseEther("100"))

    const invoiceIds = useRealisticData
        ? Array.from({ length: batchSize }, (_, i) => `INV${i.toString().padStart(13, '0')}`) // 16桁
        : Array.from({ length: batchSize }, (_, i) => `INVOICE-${i}`)

    const totalFee = fee * BigInt(batchSize)

    const tx = await vwblFidemToken
        .connect(tokenOwner)
        .mintBatch(receiptIds, tokenIds, customers, saleAmounts, invoiceIds, { value: totalFee })

    const receipt = await tx.wait()
    return {
        gasUsed: receipt.gasUsed,
        status: receipt.status,
        batchSize
    }
}

// 使用例
it("should handle batch size of 48", async () => {
    const result = await testBatchSize(48)
    console.log(`Batch size 48: ${result.gasUsed.toString()} gas used`)
    expect(result.status).to.equal(1)
})

it("should handle batch size of 48 with realistic data", async () => {
    const result = await testBatchSize(48, true)
    console.log(`Batch size 48 (realistic): ${result.gasUsed.toString()} gas used`)
    expect(result.status).to.equal(1)
})

it("should fail with batch size of 49", async () => {
    await expect(testBatchSize(49)).to.be.reverted
})
```

### Hardhat設定（テスト用）

```typescript
// hardhat.config.ts
networks: {
    hardhat: {
        chainId: 1337,
        allowUnlimitedContractSize: true,
        blockGasLimit: 100000000, // 100M gas for testing large batches
    },
}
```

## 結論

VWBLFidemTokenの`mintBatch()`関数は**最大48件**のバッチミントが可能ですが、
実運用では**30-40件**を推奨します。

これにより、ネットワークの変動やガス価格の上昇にも対応できる安全性を確保できます。
