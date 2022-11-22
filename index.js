const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app= express();
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const { raw } = require('express');

require('dotenv').config();
const stripe = require("stripe")(process.env.SECRET_KEY);


app.use(cors());
app.use(express.json());


app.get('/', (req, res)=>{
    res.send('doctor-portal is running');
});




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ebocqiq.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
  console.log('token insert verifyJWT', req.headers.authorization)
  const authHeader =req.headers.authorization;
  if(!authHeader){
    return res.status(401).send('unauthorization access')
  }
  const token= authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function(err, docoded){
    if(err){
      return res.status(403).send({message: 'forbidden access'})
    }
    req.docoded=docoded;
    next();
  })
}

async function run(){
    try{
     const appointmentOption = client.db('doctorPortal').collection('appointmentOptions');
     const bookingCollection = client.db('doctorPortal').collection('booking');
     const usersCollection = client.db('doctorPortal').collection('users');
     const doctorCollection = client.db('doctorPortal').collection('doctors');
     const paymentsCollection = client.db('doctorPortal').collection('payments');
    
    const verifyAdmin=(req, res, next)=>{
      next()
    }
    app.get('/apponintmentOption', async(req, res)=>{
        const date = req.query.date;
        const query ={}
        const options = await appointmentOption.find(query).toArray();
        const bookingQuery ={appointmentDate: date}
        const alreadyBooked= await bookingCollection.find(bookingQuery).toArray();
        options.forEach(option=>{
            const optionBooked = alreadyBooked.filter(book=>book.tritment===option.name);
            const bookSlots = optionBooked.map(book=>book.slot);
            const remainingSlots= option.slots.filter(slot=>!bookSlots.includes(slot));
            option.slots=remainingSlots;
            // console.log(date,option.name, remainingSlots.length)
        })
        res.send(options);
    })

    app.post('/booking', async(req, res)=>{
      const booking = req.body;
      console.log(booking);
      const query ={
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        tritment: booking.tritment
      }
      const alreadyBooked = await bookingCollection.find(query).toArray();

      if(alreadyBooked.length>=1){
        const message = `You already have an booking on ${booking.alreadyBooked}`
        return res.send({acknowledged:false, message})
      }
      const result = await bookingCollection.insertOne(booking);
      res.send({acknowledged:true, message: `booking success on ${booking.alreadyBooked}`})
    })

    app.get('/booking', verifyJWT, async(req, res)=>{
      const email= req.query.email;
      const docodedEmail = req.docoded.email;
      if(email !==docodedEmail){
        return res.status(403).send({message: 'forbidden access'})
      }
      const query = {email: email};
      const result =await bookingCollection.find(query).toArray();
      res.send(result)
    })

    app.get('/booking/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id:ObjectId(id)};
      const result = await bookingCollection.findOne(query);
      res.send(result)
    })

    app.post('/users', async(req, res)=>{
      const user = req.body;
      
      const result =await usersCollection.insertOne(user);
      res.send(result)
    })

    app.get('/users', async(req, res)=>{
      const query ={};
      const user= await usersCollection.find(query).toArray();
      res.send(user)
    })

    app.put('/users/admin/:id', verifyJWT, verifyAdmin, async(req, res)=>{
     
      const id = req.params.id;
      const filter = {_id:ObjectId(id)};
      const options = { upsert: true };
      const updateDos ={
        $set: {
          role: 'admin'
        }
      }
      const result= await usersCollection.updateOne(filter, updateDos,options);
      res.send(result)
    })

  app.get('/users/admin/:email', async(req, res)=>{
    const email = req.params.email;
    const query = {email};
    const user = await usersCollection.findOne(query);
    res.send({isAdmin: user?.role==='admin'})
  })


    app.get('/jwt', async(req, res)=>{
      const email = req.query.email;
      const query ={email:email};
      const user = await usersCollection.findOne(query);
      if(user){
        const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '365d'});
        return res.send({accessToken: token})
      }
      console.log(user)
      res.status(401).send({accessToken: ''})
    })


    app.get('/appointmentSpecialty', async(req, res)=>{
      const query ={};
      const result = await appointmentOption.find(query).project({name: 1}).toArray();
      res.send(result)
    })

    app.post('/doctors', verifyJWT, verifyAdmin, async(req, res)=>{
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);

      res.send({...result, ...req.body});
    })

    app.get('/doctors', verifyJWT, verifyAdmin, verifyAdmin, async(req, res)=>{
      const query={};
      const result = await doctorCollection.find(query).toArray();
      res.send(result)
    })
    app.delete('/doctors/:id', verifyJWT, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const filter = {_id:ObjectId(id)}
      const result = await doctorCollection.deleteOne(filter)
      res.send(result)
    })

    // ................Add Price....................

    app.get('/addPrice', async(req, res)=>{
      const filter ={};
      const options ={upsert: true};
      const updateDos={
        $set: {
          price: 99
        }
      }
      const result = await appointmentOption.updateMany(filter, updateDos, options);
      res.send(result);
    })

    app.post('/create-payment-intent', async(req, res)=>{
      const booking= req.body;
      const price= booking.price;
      const amount = price *100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        "payment_method_types": [
          "card"
        ],
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })
    

   app.post('/payments', async(req, res)=>{
    const payments= req.body;
    const result = await paymentsCollection.insertOne(payments);
    const id = payments.bookingId;
    const filter={_id:ObjectId(id)};
    const updateDos={
       $set:{
        paid: true,
        transactionId:payments.transactionId
       }
    }
    const updateResult= await bookingCollection.updateOne(filter, updateDos)
    res.send(result)
   })

    }
    finally{

    }
}
run().catch(console.dir);


app.listen(port, ()=>{
    console.log(`doctor portal server is running ${port}`)
})