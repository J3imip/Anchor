import * as anchor from "@coral-xyz/anchor";
import {IdlAccounts, Program} from "@coral-xyz/anchor";
import {Thnr} from "../target/types/thnr";
import {Keypair, PublicKey} from "@solana/web3.js";

describe("thnr", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const airdropLamports = 10 ** 9;

  const program = anchor.workspace.Thnr as Program<Thnr>;
  const creator = Keypair.generate();
  const liker = Keypair.generate();
  const commenter = Keypair.generate();

  const [creatorProfilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_profile"), creator.publicKey.toBuffer()],
    program.programId
  );

  const [likerProfilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_profile"), liker.publicKey.toBuffer()],
    program.programId
  );

  const [commenterProfilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_profile"), commenter.publicKey.toBuffer()],
    program.programId
  );

  const [creatorVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), creator.publicKey.toBuffer()],
    program.programId
  );

  const postPdas: PublicKey[] = [];

  before(async () => {
    await fundAccount(creator);
    await fundAccount(liker);
    await fundAccount(commenter);

    await initializeUser(creator, creatorProfilePda);
    await initializeUser(liker, likerProfilePda);
    await initializeUser(commenter, commenterProfilePda);

    console.log("Creator balance:", (await provider.connection.getBalance(creator.publicKey)) / 10 ** 9, "SOL");
    console.log("Liker balance:", (await provider.connection.getBalance(liker.publicKey)) / 10 ** 9, "SOL");
    console.log("Commenter balance:", (await provider.connection.getBalance(commenter.publicKey)) / 10 ** 9, "SOL");
  });

  it("Creator creates posts", async () => {
    for (let i = 0; i < 2; i++) {
      postPdas.push(await createPost(
        creator,
        creatorProfilePda,
        creatorVaultPda,
        `Seledka ${i}`,
        `This is seledka number ${i}`
      ));
    }
  });

  it("Liker likes a post", async () => {
    const post = postPdas[0];
    console.log("Post liked: " + getTxInfoURL(await program.methods
      .likePost()
      .accounts({
        post,
        user: liker.publicKey,
        authorAccount: creator.publicKey,
      })
      .signers([liker])
      .rpc({commitment: "confirmed"})
    ));
  });

  it("Commenter comments on a post", async () => {
    const post = postPdas[1];
    await commentOnPost(commenter, post, "cool post");
    await commentOnPost(commenter, post, "+1");
  });

  it("Delete all posts", async () => {
    const posts = await program.account.post.all();
    displayPosts(...posts.map(post => post.account));

    for (const post of posts) {
      console.log("Post deleted: " + getTxInfoURL(await program.methods
        .deletePost()
        .accounts({
          post: post.publicKey,
          user: creator.publicKey,
        })
        .signers([creator])
        .rpc({commitment: "confirmed"})
      ));
    }

    const balances = await program.provider.connection.getBalance(creator.publicKey);
    console.log("Creator balance:", balances / 10 ** 9, "SOL");

    const balances2 = await program.provider.connection.getBalance(liker.publicKey);
    console.log("Liker balance:", balances2 / 10 ** 9, "SOL");

    const balances3 = await program.provider.connection.getBalance(commenter.publicKey);
    console.log("Commenter balance:", balances3 / 10 ** 9, "SOL");
  });

  async function initializeUser(user: Keypair, userProfilePda: PublicKey) {
    const accountInfo = await provider.connection.getAccountInfo(userProfilePda);
    if (!accountInfo) {
      const tx = await program.methods
        .initializeUser()
        .accounts({
          //@ts-ignore
          userProfile: userProfilePda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc({commitment: "confirmed"});

      console.log("User profile created for:", user.publicKey.toBase58(), getTxInfoURL(tx));
    }
  }


  async function fundAccount(wallet: Keypair) {
    const signature = await provider.connection.requestAirdrop(
      wallet.publicKey,
      airdropLamports
    );

    const latestBlockHash = await provider.connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: signature,
    });
  }

  async function createPost(
    user: Keypair,
    userProfilePda: PublicKey,
    vaultPda: PublicKey,
    title: string,
    content: string
  ): Promise<PublicKey> {
    const userProfileAccount = await program.account.userProfile.fetch(userProfilePda);
    const postCount = userProfileAccount.postCount;
    const [postPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("post"),
        user.publicKey.toBuffer(),
        Buffer.from(new anchor.BN(postCount).toArray("le", 8))
      ],
      program.programId
    );

    console.log("Post created: " + getTxInfoURL(await program.methods
      .initializePost(title, content)
      .accounts({
        //@ts-ignore
        post: postPda,
        userProfile: userProfilePda,
        user: user.publicKey,
        vaultAccount: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])
      .rpc({commitment: "confirmed"})
    ));

    return postPda;
  }

  async function commentOnPost(user: Keypair, postPda: PublicKey, content: string) {
    const tx = await program.methods
      .commentPost(content)
      .accounts({
        post: postPda,
        user: user.publicKey,
        //@ts-ignore
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])
      .rpc({commitment: "confirmed"});

    console.log("Comment added by:", user.publicKey.toBase58(), getTxInfoURL(tx));
  }
  function getTxInfoURL(tx: string) {
    const rpc = provider.connection.rpcEndpoint;
    const cluster = rpc.includes("devnet") ? "devnet" : "localnet";

    return `https://solana.fm/tx/${tx}?cluster=${cluster}-solana`;
  }

  function displayPosts(...posts: IdlAccounts<Thnr>["post"][]) {
    let logStringBuilder = "";

    posts.forEach(post => {
      logStringBuilder += `Post:\n`;
      logStringBuilder += `Author: ${post.author}\n`;
      logStringBuilder += `Title: ${post.title}\n`;
      logStringBuilder += `Content: ${post.content}\n`;
      logStringBuilder += `Like count: ${post.likeCount}\n`;
      logStringBuilder += `Comments:\n`;

      post.comments.forEach(comment => {
        const date = new Date(comment.timestamp.toNumber() * 1000);
        const formattedDate = `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit'
        })}`;
        logStringBuilder += `\t- ${comment.author} at ${formattedDate}: ${comment.content}\n`;
      });

      logStringBuilder += `\n`;
    });

    console.log(logStringBuilder);
  }
});
